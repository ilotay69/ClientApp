"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { createAlert } from "@/lib/alerts";
import { sendPushToUsers } from "@/lib/push-notifications";
import { computeProposalTotals, formatProposalHeadline, formatMoney } from "@/lib/proposal-totals";
import { isProposalExpired, type ProposalStatus } from "@/lib/proposal-data";

// These actions are reachable by anyone holding a proposal link — there is
// no login on this route at all. Two rules follow from that, and every
// function below obeys them:
//
//   1. The token is the only way in. Nothing here accepts a proposal id,
//      so a caller can only ever act on the one proposal whose token they
//      already have.
//   2. Nothing the page rendered is trusted. A Server Action is its own
//      POST endpoint, reachable regardless of what the page chose to show,
//      so status and expiry are re-checked here rather than assumed from
//      the fact that a button was visible.

/** Rough, deliberately generous user-agent test. Anything matching is still
 * logged — a proposal_views row with is_bot set is useful when someone
 * claims they never got the link — but never counts toward view_count. */
// Deliberately excludes "outlook": a prospect reading this in the Outlook
// mobile app's in-app browser is a real read, and suppressing it would
// undercount exactly the people most likely to be reading. The JS-plus-
// dwell requirement in ProposalViewBeacon is the primary filter here; this
// pattern is only a second line against scanners that do run scripts.
const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|scan|headless|python-requests|curl|wget|safelinks|proofpoint|mimecast|barracuda|skypeuripreview|whatsapp|facebookexternalhit|slackbot|discord/i;

/** How long after a counted view a repeat from the same proposal is treated
 * as the same sitting rather than a new one. Stops a reload, a back
 * button, or a second tab inflating the number the whole feature is judged
 * on. */
const VIEW_DEDUPE_MINUTES = 30;

/** The caller's address, as seen through Railway's proxy. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Salted so the stored value can't be reversed against the small space of
  // possible IPs by anyone who gets at the table. Never the raw address:
  // this is a prospect's personal data and all we need is to tell two
  // readers apart.
  const salt = process.env.PROPOSAL_VIEW_IP_SALT ?? process.env.CRON_SECRET ?? "cg-proposals";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function recordProposalViewAction(token: string, userAgent: string): Promise<void> {
  const admin = createAdminClient();

  const { data: proposal } = await admin
    .from("proposals")
    .select("id, status, view_count, first_viewed_at")
    .eq("access_token", token)
    .maybeSingle();
  // A revoked or unknown token records nothing at all — otherwise this
  // would be a free oracle for testing whether a guessed token exists.
  if (!proposal) return;
  // A draft has no business being viewable, and an accepted proposal's
  // re-reads aren't the signal the count exists to carry.
  if (proposal.status === "draft") return;

  const isBot = BOT_PATTERN.test(userAgent ?? "");

  await admin.from("proposal_views").insert({
    proposal_id: proposal.id,
    user_agent: (userAgent ?? "").slice(0, 500),
    ip_hash: hashIp(await clientIp()),
    is_bot: isBot,
    source: "beacon",
  });

  if (isBot) return;

  const cutoff = new Date(Date.now() - VIEW_DEDUPE_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("proposal_views")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", proposal.id)
    .eq("is_bot", false)
    .gte("viewed_at", cutoff);

  // The row this call just inserted is included in that count, so anything
  // above 1 means there was already a recent view — same sitting.
  if ((count ?? 0) > 1) return;

  const now = new Date().toISOString();
  await admin
    .from("proposals")
    .update({
      view_count: (proposal.view_count ?? 0) + 1,
      last_viewed_at: now,
      first_viewed_at: proposal.first_viewed_at ?? now,
    })
    .eq("id", proposal.id);

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposal.id}`);
}

export type AcceptProposalResult = { ok: boolean; message: string };

export async function acceptProposalByTokenAction(
  token: string,
  input: {
    acceptedByName: string;
    acceptedByEmail: string;
    selectedOptionalItemIds: string[];
    authorityConfirmed: boolean;
  }
): Promise<AcceptProposalResult> {
  const name = input.acceptedByName?.trim() ?? "";
  const email = input.acceptedByEmail?.trim() ?? "";
  if (!name) return { ok: false, message: "Please enter your name." };
  // Not identity verification — nobody is cryptographically signing
  // anything here — but a recorded, affirmative statement of authority is
  // the standard a court or an internal dispute actually looks for in a
  // click-to-accept flow. Required server-side, not just a disabled
  // button: see the file-level note on why nothing the page rendered is
  // trusted.
  if (!input.authorityConfirmed) {
    return { ok: false, message: "Please confirm you have authority to accept this proposal." };
  }

  const admin = createAdminClient();

  const { data: proposal } = await admin
    .from("proposals")
    .select("id, status, valid_until, title, owner_id, created_by, currency, prospect_company, clients(name)")
    .eq("access_token", token)
    .maybeSingle();
  if (!proposal) {
    return { ok: false, message: "This link is no longer valid. Please ask your contact for a new one." };
  }

  // Re-checked here, not inferred from the page having shown an Accept
  // button — see the note at the top of this file.
  const status = proposal.status as ProposalStatus;
  if (status === "accepted") {
    return { ok: false, message: "This proposal has already been accepted." };
  }
  if (status !== "sent") {
    return { ok: false, message: "This proposal isn't open for acceptance." };
  }
  if (isProposalExpired(status, proposal.valid_until ?? null)) {
    return { ok: false, message: "This proposal has expired. Please ask your contact for an updated copy." };
  }

  const h = await headers();
  const userAgent = (h.get("user-agent") ?? "").slice(0, 500);
  const ipHash = hashIp(await clientIp());

  // The proposal row is updated FIRST, guarded on accepted_at still being
  // null. Two submits racing each other — a double-click, or a resent POST
  // — both reach here, but only one matches that filter, so only one gets a
  // row back and the other exits without touching anything. Everything
  // knowable at this point (who, and the circumstances of the click) is
  // written in this same claim — the totals below need the optional-item
  // write to happen first, so they're recorded in a second update once
  // we've already secured the row.
  const acceptedAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from("proposals")
    .update({
      status: "accepted",
      accepted_at: acceptedAt,
      accepted_by_name: name,
      accepted_by_email: email || null,
      accepted_via: "link",
      accepted_ip_hash: ipHash,
      accepted_user_agent: userAgent || null,
      accept_authority_confirmed: true,
    })
    .eq("id", proposal.id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { ok: false, message: "This proposal has already been accepted." };
  }

  // Only now write which optional add-ons were taken. Scoped to this
  // proposal's optional rows only, and everything not in the submitted list
  // is explicitly set back to false, so a crafted request can't switch on
  // an item belonging to someone else's proposal or silently leave a stale
  // selection behind.
  const selected = Array.isArray(input.selectedOptionalItemIds) ? input.selectedOptionalItemIds : [];
  await admin
    .from("proposal_line_items")
    .update({ is_selected: false })
    .eq("proposal_id", proposal.id)
    .eq("is_optional", true);
  if (selected.length > 0) {
    await admin
      .from("proposal_line_items")
      .update({ is_selected: true })
      .eq("proposal_id", proposal.id)
      .eq("is_optional", true)
      .in("id", selected);
  }

  // Read the totals back from the database rather than trusting anything
  // the browser sent — this is the number that gets permanently recorded
  // as what was agreed to, so it must come from the rows, not the request.
  const { data: finalItems } = await admin
    .from("proposal_line_items")
    .select("id, description, quantity, unit_price, billing_period, is_optional, is_selected")
    .eq("proposal_id", proposal.id);

  const totals = computeProposalTotals(
    (finalItems ?? []).map((i: Record<string, unknown>) => ({
      id: i.id as string,
      description: i.description as string,
      quantity: Number(i.quantity ?? 0),
      unitPrice: Number(i.unit_price ?? 0),
      billingPeriod: (i.billing_period as "one_off" | "annual" | "monthly") ?? "one_off",
      isOptional: Boolean(i.is_optional),
      isSelected: Boolean(i.is_selected),
    }))
  );

  // A permanent snapshot of what was actually agreed to and what it added
  // up to at that moment — independent of whatever the line items say
  // later. Nothing else in this app rewrites an accepted proposal's items,
  // but this is the record that survives even if that ever changes.
  await admin
    .from("proposals")
    .update({
      accepted_total_amount: totals.firstInvoiceTotal,
      accepted_tax_amount: totals.taxAmount,
      accepted_tax_rate: totals.taxRate,
    })
    .eq("id", proposal.id);

  const client = Array.isArray(proposal.clients) ? proposal.clients[0] : proposal.clients;
  const company = client?.name ?? proposal.prospect_company ?? "A prospect";
  const headline = formatProposalHeadline(totals, proposal.currency ?? "CAD");

  // Best-effort, each independently caught: a notification failing must
  // never make an accepted proposal look like it failed to the person who
  // just accepted it.
  try {
    await createAlert(
      admin,
      [proposal.owner_id, proposal.created_by],
      "proposal_accepted",
      `${company} accepted "${proposal.title}"`,
      `${name} accepted it — ${headline} — ${formatMoney(totals.firstInvoiceTotal, proposal.currency ?? "CAD")} incl. HST due at signing.`,
      `/proposals/${proposal.id}`
    );
  } catch (err) {
    console.error("acceptProposalByTokenAction: alert failed", err);
  }

  const recipients = [...new Set([proposal.owner_id, proposal.created_by].filter(Boolean))] as string[];
  try {
    await sendPushToUsers(admin, recipients, {
      title: "Proposal accepted",
      body: `${company} accepted "${proposal.title}" — ${headline}`,
      url: `/proposals/${proposal.id}`,
    });
  } catch (err) {
    console.error("acceptProposalByTokenAction: push failed", err);
  }

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposal.id}`);
  revalidatePath(`/proposal-view/${token}`);

  return { ok: true, message: "Accepted" };
}
