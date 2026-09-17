"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getProposal, computeProposalBlockers } from "@/lib/proposal-data";
import { formatProposalHeadline } from "@/lib/proposal-totals";
import { getEmailTemplate, applyTemplateVars } from "@/lib/email-templates";
import { buildProposalEmail } from "@/lib/resend";
import { sendMailAsSharedMailbox } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";
import { resolveAppUrl } from "@/lib/app-url";
import { formatDate } from "@/lib/format";

export type ProposalActionState = { ok: boolean; message: string };
export type CreateProposalState = { error: string } | undefined;

const DENIED: ProposalActionState = {
  ok: false,
  message: "You don't have permission to do that.",
};

/** A proposal's content is only editable while it's a draft. Once it's been
 * sent, the prospect is looking at a URL that renders live from these rows
 * — editing them would silently change the document underneath someone
 * who's mid-read, and could change the price under someone about to accept.
 * reviseProposalAction is the deliberate way back to draft.
 *
 * Enforced here in every edit action rather than only by the UI hiding the
 * controls: a Server Action is its own POST endpoint, reachable regardless
 * of what the page chose to render. */
async function assertDraft(
  proposalId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  const { data } = await admin.from("proposals").select("status").eq("id", proposalId).maybeSingle();
  return data?.status === "draft";
}

function revalidateProposal(proposalId: string) {
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposalId}`);
}

/** The starting skeleton for a new proposal. Deliberately opinionated —
 * a rep staring at an empty page writes a worse proposal (and a slower
 * one) than a rep editing four headings that are already in the right
 * order. The pricing section is a positional marker for where the line-item
 * table renders; the items themselves hang off the proposal (see 129). */
const DEFAULT_SECTIONS = [
  {
    kind: "overview",
    heading: "Overview",
    body: "",
    sort_order: 0,
  },
  {
    kind: "steps",
    heading: "What we'll do",
    body: "",
    sort_order: 1,
  },
  {
    kind: "pricing",
    heading: "Investment",
    body: "",
    sort_order: 2,
  },
  {
    kind: "next_steps",
    heading: "Next steps",
    body: "",
    sort_order: 3,
  },
];

export async function createProposalAction(
  title: string,
  recipient: {
    clientId: string | null;
    company: string | null;
    contactName: string | null;
    email: string | null;
  }
): Promise<CreateProposalState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return { error: "You don't have permission to do that." };

  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { error: "Give the proposal a title." };

  const admin = createAdminClient();

  // Either an existing client or a named prospect company — the same check
  // the proposals_recipient_present constraint enforces, caught here so the
  // user gets a sentence instead of a Postgres error.
  const company = recipient.company?.trim() || null;
  if (!recipient.clientId && !company) {
    return { error: "Choose an existing client, or enter the prospect's company name." };
  }

  // For an existing client, snapshot their name into prospect_company too,
  // so an accepted proposal still says who it went to even if the client is
  // later renamed or unlinked.
  let snapshotCompany = company;
  if (recipient.clientId && !snapshotCompany) {
    const { data: client } = await admin
      .from("clients")
      .select("name")
      .eq("id", recipient.clientId)
      .maybeSingle();
    snapshotCompany = client?.name ?? null;
  }

  const { data, error } = await admin
    .from("proposals")
    .insert({
      client_id: recipient.clientId,
      prospect_company: snapshotCompany,
      prospect_contact_name: recipient.contactName?.trim() || null,
      prospect_email: recipient.email?.trim() || null,
      title: trimmedTitle,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createProposalAction: insert failed", error);
    return { error: "Could not create the proposal." };
  }

  const { error: sectionError } = await admin
    .from("proposal_sections")
    .insert(DEFAULT_SECTIONS.map((s) => ({ ...s, proposal_id: data.id })));
  if (sectionError) {
    console.error("createProposalAction: default sections failed", sectionError);
  }

  redirect(`/proposals/${data.id}`);
}

export async function updateProposalFieldAction(
  proposalId: string,
  field: string,
  value: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  // An allowlist, not the caller's string: this writes straight into an
  // update() and the field name arrives from the browser.
  const ALLOWED = new Set([
    "title",
    "intro",
    "closing_note",
    "valid_until",
    "currency",
    "prospect_company",
    "prospect_contact_name",
    "prospect_email",
  ]);
  if (!ALLOWED.has(field)) return;

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) return;

  const trimmed = value.trim();
  await admin
    .from("proposals")
    // A date column rejects "" — an emptied date field means "no expiry".
    .update({ [field]: trimmed === "" ? null : trimmed })
    .eq("id", proposalId);
  revalidateProposal(proposalId);
}

export async function deleteProposalAction(proposalId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("proposals").delete().eq("id", proposalId);
  revalidatePath("/proposals");
  redirect("/proposals");
}

// ---------------------------------------------------------------- sections

export async function addProposalSectionAction(
  proposalId: string,
  heading: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) return;

  const { data: last } = await admin
    .from("proposal_sections")
    .select("sort_order")
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from("proposal_sections").insert({
    proposal_id: proposalId,
    kind: "custom",
    heading: heading.trim() || "New section",
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  revalidateProposal(proposalId);
}

export async function updateProposalSectionAction(
  sectionId: string,
  field: "heading" | "body",
  value: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;
  if (field !== "heading" && field !== "body") return;

  const admin = createAdminClient();
  const { data: section } = await admin
    .from("proposal_sections")
    .select("proposal_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return;
  if (!(await assertDraft(section.proposal_id, admin))) return;

  await admin
    .from("proposal_sections")
    .update({ [field]: field === "heading" ? value.trim() || "Untitled section" : value })
    .eq("id", sectionId);
  revalidateProposal(section.proposal_id);
}

export async function deleteProposalSectionAction(sectionId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: section } = await admin
    .from("proposal_sections")
    .select("proposal_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return;
  if (!(await assertDraft(section.proposal_id, admin))) return;

  await admin.from("proposal_sections").delete().eq("id", sectionId);
  revalidateProposal(section.proposal_id);
}

/** Up/down rather than drag-and-drop. No DnD library is in package.json,
 * and adding one to an 11-dependency app for one screen isn't the trade —
 * but the real reason is that HTML5 drag-and-drop does nothing at all on
 * touch, and repricing a proposal on an iPad between meetings is a case
 * this has to work for. Buttons are keyboard- and screen-reader-operable
 * for free.
 *
 * Swaps sort_order with the adjacent sibling instead of rewriting the whole
 * list, so two people reordering at once can't blank each other's work. */
export async function moveProposalSectionAction(
  sectionId: string,
  direction: "up" | "down"
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: section } = await admin
    .from("proposal_sections")
    .select("id, proposal_id, sort_order")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return;
  if (!(await assertDraft(section.proposal_id, admin))) return;

  // The nearest sibling in that direction: the largest sort_order below
  // this one going up, the smallest above it going down.
  const base = admin
    .from("proposal_sections")
    .select("id, sort_order")
    .eq("proposal_id", section.proposal_id);
  const { data: neighbour } =
    direction === "up"
      ? await base.lt("sort_order", section.sort_order).order("sort_order", { ascending: false }).limit(1).maybeSingle()
      : await base.gt("sort_order", section.sort_order).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  if (!neighbour) return;

  await Promise.all([
    admin.from("proposal_sections").update({ sort_order: neighbour.sort_order }).eq("id", section.id),
    admin.from("proposal_sections").update({ sort_order: section.sort_order }).eq("id", neighbour.id),
  ]);
  revalidateProposal(section.proposal_id);
}

// -------------------------------------------------------------- line items

export async function addProposalLineItemAction(proposalId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) return;

  const { data: last } = await admin
    .from("proposal_line_items")
    .select("sort_order")
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from("proposal_line_items").insert({
    proposal_id: proposalId,
    description: "New item",
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  revalidateProposal(proposalId);
}

export async function updateProposalLineItemAction(
  itemId: string,
  field: string,
  value: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("proposal_line_items")
    .select("proposal_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return;
  if (!(await assertDraft(item.proposal_id, admin))) return;

  // Each field is coerced to the shape its column actually holds, and the
  // numeric ones are clamped at zero — the check constraints in 129 would
  // reject a negative, and a rejected write from an inline editor is
  // invisible to whoever typed it.
  let patch: Record<string, unknown> | null = null;
  switch (field) {
    case "description":
      patch = { description: value.trim() || "Untitled item" };
      break;
    case "detail":
      patch = { detail: value.trim() || null };
      break;
    case "quantity":
    case "unit_price": {
      const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(parsed)) return;
      patch = { [field]: Math.max(0, parsed) };
      break;
    }
    case "billing_period":
      if (value !== "one_off" && value !== "monthly") return;
      patch = { billing_period: value };
      break;
    case "is_optional": {
      // is_selected always resets: it's the prospect's own choice, only
      // meaningful while is_optional is true, and a stale "true" left on a
      // row that just stopped being optional would make the totals
      // module's included-item test ambiguous.
      patch = { is_optional: value === "true", is_selected: false };
      break;
    }
    default:
      return;
  }

  await admin.from("proposal_line_items").update(patch).eq("id", itemId);
  revalidateProposal(item.proposal_id);
}

export async function deleteProposalLineItemAction(itemId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("proposal_line_items")
    .select("proposal_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return;
  if (!(await assertDraft(item.proposal_id, admin))) return;

  await admin.from("proposal_line_items").delete().eq("id", itemId);
  revalidateProposal(item.proposal_id);
}

// --------------------------------------------------------------- lifecycle

/** Sends the proposal, or re-sends it as a reminder.
 *
 * The access token is minted here on the first send and then kept for the
 * life of the proposal. Quarterly reviews rotate their token on every send,
 * because a corrected review must invalidate the old link — but a prospect
 * forwards a proposal link to their business partner or their accountant,
 * and rotating it would break it under them with no explanation.
 * revokeProposalLinkAction is the deliberate way to kill a link. */
export async function sendProposalAction(
  proposalId: string,
  toEmail: string
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const trimmedEmail = toEmail.trim();
  if (!trimmedEmail) return { ok: false, message: "Enter an email address to send to." };

  const admin = createAdminClient();
  const proposal = await getProposal(proposalId, admin);
  if (!proposal) return { ok: false, message: "Proposal not found." };

  const isResend = proposal.status === "sent";
  if (proposal.status !== "draft" && !isResend) {
    return { ok: false, message: "This proposal isn't in a state that can be sent." };
  }

  // The same checks the editor's "Ready to send" list shows, run again here
  // — the button being enabled is not the authority on whether this is
  // sendable.
  const blockers = computeProposalBlockers({ ...proposal, prospectEmail: trimmedEmail });
  if (blockers.length > 0) {
    return { ok: false, message: blockers[0]! };
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) return { ok: false, message: "The shared mailbox isn't configured." };
  const settings = await getSharedMailboxSettings(admin);
  if (!settings) return { ok: false, message: "The shared mailbox integration isn't set up yet." };

  const accessToken = proposal.accessToken ?? crypto.randomUUID();
  const viewUrl = `${resolveAppUrl()}/proposal-view/${accessToken}`;

  try {
    const graphToken = await getValidSharedMailboxToken(admin, settings);
    const template = await getEmailTemplate(admin, "proposal");
    const templateVars = {
      recipient_name: proposal.prospectContactName ?? "",
      company_name: proposal.clientName ?? proposal.prospectCompany ?? "",
      proposal_title: proposal.title,
      valid_until: formatDate(proposal.validUntil),
    };

    const { html, text } = buildProposalEmail(
      proposal.prospectContactName,
      proposal.clientName ?? proposal.prospectCompany ?? "",
      proposal.title,
      formatProposalHeadline(proposal.totals, proposal.currency),
      viewUrl,
      proposal.validUntil ? formatDate(proposal.validUntil) : null,
      applyTemplateVars(template.intro, templateVars),
      applyTemplateVars(template.note, templateVars),
      isResend ? `Reminder ${proposal.reminderCount + 1}` : null
    );

    await sendMailAsSharedMailbox(graphToken, mailboxEmail, {
      to: trimmedEmail,
      subject: applyTemplateVars(template.subject, templateVars),
      html,
      text,
    });
  } catch (err) {
    console.error("sendProposalAction: send failed", err);
    return { ok: false, message: "Sending failed — check the shared mailbox settings." };
  }

  await admin
    .from("proposals")
    .update(
      isResend
        ? {
            reminder_count: proposal.reminderCount + 1,
            last_reminder_at: new Date().toISOString(),
            sent_to_email: trimmedEmail,
          }
        : {
            status: "sent",
            sent_at: new Date().toISOString(),
            sent_to_email: trimmedEmail,
            prospect_email: trimmedEmail,
            access_token: accessToken,
          }
    )
    .eq("id", proposalId);

  revalidateProposal(proposalId);
  return {
    ok: true,
    message: isResend ? `Reminder sent to ${trimmedEmail}.` : `Sent to ${trimmedEmail}.`,
  };
}

/** Records an acceptance that happened off-platform — the prospect said yes
 * on a call. Guarded on accepted_at still being null so it can't overwrite
 * a real link acceptance that landed first. */
export async function markProposalAcceptedByStaffAction(
  proposalId: string,
  acceptedByName: string
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const name = acceptedByName.trim();
  if (!name) return { ok: false, message: "Enter who accepted it." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("proposals")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_name: name,
      accepted_via: "staff",
      accepted_recorded_by: user.id,
    })
    .eq("id", proposalId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("markProposalAcceptedByStaffAction failed", error);
    return { ok: false, message: "Could not record that." };
  }
  if (!data) return { ok: false, message: "This proposal has already been accepted." };

  revalidateProposal(proposalId);
  return { ok: true, message: `Recorded as accepted by ${name}.` };
}

export async function declineProposalAction(
  proposalId: string,
  reason: string
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      decline_reason: reason.trim() || null,
    })
    .eq("id", proposalId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, message: "This proposal has already been accepted." };
  revalidateProposal(proposalId);
  return { ok: true, message: "Marked as declined." };
}

export async function withdrawProposalAction(proposalId: string): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .update({ status: "withdrawn" })
    .eq("id", proposalId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, message: "This proposal has already been accepted." };
  revalidateProposal(proposalId);
  return { ok: true, message: "Withdrawn. The link now shows as no longer available." };
}

/** Back to draft so it can be edited and re-sent. The access token is
 * deliberately kept: the prospect may already have forwarded that link
 * internally, and they should land on the corrected version rather than a
 * dead page. Use revokeProposalLinkAction when the old link genuinely
 * needs to stop working. */
export async function reviseProposalAction(proposalId: string): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .update({ status: "draft" })
    .eq("id", proposalId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, message: "An accepted proposal can't be revised." };
  revalidateProposal(proposalId);
  return { ok: true, message: "Back to draft. The existing link will show the revised version once you send again." };
}

export async function revokeProposalLinkAction(proposalId: string): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  await admin.from("proposals").update({ access_token: null }).eq("id", proposalId);
  revalidateProposal(proposalId);
  return { ok: true, message: "Link revoked. Anyone who opens it now sees an invalid-link page." };
}

/** The raw open log behind the "opened 4 times" pill — loaded on demand
 * rather than with the page, since it's only ever looked at when someone is
 * specifically arguing about whether a proposal was received. */
export async function fetchProposalViewsAction(
  proposalId: string
): Promise<{ viewedAt: string; isBot: boolean; userAgent: string | null }[]> {
  const user = await requirePermission("view_proposals");
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposal_views")
    .select("viewed_at, is_bot, user_agent")
    .eq("proposal_id", proposalId)
    .order("viewed_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((r: { viewed_at: string; is_bot: boolean; user_agent: string | null }) => ({
    viewedAt: r.viewed_at,
    isBot: r.is_bot,
    userAgent: r.user_agent,
  }));
}
