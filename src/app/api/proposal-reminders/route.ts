import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildProposalEmail } from "@/lib/resend";
import { sendMailAsSharedMailbox, type SharedMailboxAttachment } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";
import { getEmailTemplate, applyTemplateVars } from "@/lib/email-templates";
import { computeProposalTotals, formatProposalHeadline } from "@/lib/proposal-totals";
import { resolveAppUrl } from "@/lib/app-url";
import { formatDate } from "@/lib/format";
import { fetchBrochuresForProposal, PROPOSAL_BROCHURES_BUCKET } from "@/lib/proposal-brochures";

export const dynamic = "force-dynamic";

/** How long to wait before chasing an unanswered proposal. */
const REMINDER_INTERVAL_DAYS = 5;

/** A prospect is not a contracted client. Unlimited chasing is both bad
 * selling and a deliverability risk — a proposal that's been ignored three
 * times needs a phone call, not a fourth email. */
const MAX_REMINDERS = 3;

const ORDINAL_WORDS = ["First", "Second", "Third", "Fourth", "Fifth"];
function ordinalReminderLabel(n: number): string {
  return `${ORDINAL_WORDS[n - 1] ?? `${n}th`} reminder`;
}

type DueProposal = {
  id: string;
  title: string;
  currency: string;
  valid_until: string | null;
  access_token: string | null;
  sent_at: string | null;
  sent_to_email: string | null;
  prospect_company: string | null;
  prospect_contact_name: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  clients: { name: string } | { name: string }[] | null;
};

/**
 * Two jobs in one pass, both driven by whatever cadence a Railway cron
 * trigger calls this on (daily is fine — this route decides what's actually
 * due, so running it more often than the interval is harmless). Send
 * `X-Cron-Secret: <CRON_SECRET>`.
 *
 *   1. Expiry sweep: any sent proposal past its valid_until flips to
 *      "expired". The public page checks expiry at read time too, so this
 *      is about keeping the staff list honest, not about access control.
 *   2. Reminders: re-send the proposal email to anyone who hasn't
 *      answered, up to MAX_REMINDERS.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Expiry first, so a proposal that expired today doesn't also get chased
  // with a reminder in the same run.
  const { data: expiredRows } = await admin
    .from("proposals")
    .update({ status: "expired" })
    .eq("status", "sent")
    .is("accepted_at", null)
    .not("valid_until", "is", null)
    .lt("valid_until", today)
    .select("id");
  const expired = (expiredRows ?? []).length;

  const { data: candidates, error } = await admin
    .from("proposals")
    .select(
      `id, title, currency, valid_until, access_token, sent_at, sent_to_email,
       prospect_company, prospect_contact_name, reminder_count, last_reminder_at,
       clients(name)`
    )
    .eq("status", "sent")
    .is("accepted_at", null)
    .not("access_token", "is", null)
    .lt("reminder_count", MAX_REMINDERS);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const intervalMs = REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
  const due = ((candidates ?? []) as DueProposal[]).filter((p) => {
    if (!p.sent_to_email || !p.access_token) return false;
    const lastContact = new Date(p.last_reminder_at ?? p.sent_at ?? now).getTime();
    return now - lastContact >= intervalMs;
  });

  if (due.length === 0) {
    return NextResponse.json({ expired, sent: 0, results: [] });
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) {
    return NextResponse.json({ error: "SHARED_MAILBOX_EMAIL isn't set.", expired }, { status: 500 });
  }
  const sharedMailboxSettings = await getSharedMailboxSettings(admin);
  if (!sharedMailboxSettings) {
    return NextResponse.json(
      { error: "The shared mailbox integration isn't set up yet.", expired },
      { status: 500 }
    );
  }
  const accessToken = await getValidSharedMailboxToken(admin, sharedMailboxSettings);
  const template = await getEmailTemplate(admin, "proposal");
  const appUrl = resolveAppUrl();

  const results: { proposalId: string; ok: boolean; reminder?: number; error?: string }[] = [];

  for (const proposal of due) {
    const client = Array.isArray(proposal.clients) ? proposal.clients[0] : proposal.clients;
    const companyName = client?.name ?? proposal.prospect_company ?? "";
    const reminderNumber = proposal.reminder_count + 1;

    try {
      // Totals are recomputed per proposal rather than carried on the row,
      // so a reminder always quotes the current pricing.
      const { data: items } = await admin
        .from("proposal_line_items")
        .select("id, description, quantity, unit_price, billing_period, is_optional, is_selected")
        .eq("proposal_id", proposal.id);

      const totals = computeProposalTotals(
        (items ?? []).map((i: Record<string, unknown>) => ({
          id: i.id as string,
          description: i.description as string,
          quantity: Number(i.quantity ?? 0),
          unitPrice: Number(i.unit_price ?? 0),
          billingPeriod: (i.billing_period as "one_off" | "annual" | "monthly") ?? "one_off",
          isOptional: Boolean(i.is_optional),
          isSelected: Boolean(i.is_selected),
        }))
      );

      const templateVars = {
        recipient_name: proposal.prospect_contact_name ?? "",
        company_name: companyName,
        proposal_title: proposal.title,
        valid_until: formatDate(proposal.valid_until),
      };

      const { html, text } = buildProposalEmail(
        proposal.prospect_contact_name,
        companyName,
        proposal.title,
        formatProposalHeadline(totals, proposal.currency ?? "CAD"),
        `${appUrl}/proposal-view/${proposal.access_token}`,
        proposal.valid_until ? formatDate(proposal.valid_until) : null,
        applyTemplateVars(template.intro, templateVars),
        applyTemplateVars(template.note, templateVars),
        ordinalReminderLabel(reminderNumber)
      );

      // Whatever's checked right now, not a snapshot from the original
      // send — a rep may have added a brochure since, and a reminder is a
      // fresh chance for it to reach the prospect.
      const brochures = await fetchBrochuresForProposal(proposal.id, admin);
      const attachments: SharedMailboxAttachment[] = [];
      for (const brochure of brochures) {
        try {
          const { data: blob, error: downloadError } = await admin.storage
            .from(PROPOSAL_BROCHURES_BUCKET)
            .download(brochure.storagePath);
          if (downloadError || !blob) continue;
          attachments.push({
            filename: brochure.fileName,
            contentBase64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
            contentType: brochure.contentType || "application/octet-stream",
          });
        } catch (err) {
          console.error("proposal-reminders: brochure fetch failed", brochure.id, err);
        }
      }

      await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
        to: proposal.sent_to_email!,
        subject: applyTemplateVars(template.subject, templateVars),
        html,
        text,
        attachments,
      });

      await admin
        .from("proposals")
        .update({ reminder_count: reminderNumber, last_reminder_at: new Date().toISOString() })
        .eq("id", proposal.id);

      results.push({ proposalId: proposal.id, ok: true, reminder: reminderNumber });
    } catch (err) {
      console.error("proposal-reminders: send failed", { proposalId: proposal.id, err });
      results.push({
        proposalId: proposal.id,
        ok: false,
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  return NextResponse.json({ expired, sent: results.filter((r) => r.ok).length, results });
}
