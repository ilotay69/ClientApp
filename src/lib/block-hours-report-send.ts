import { createAdminClient } from "@/lib/supabase/server";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchContractUsageForCompany } from "@/lib/contract-hours";
import { buildContractUsagePdf } from "@/lib/contract-usage-pdf";
import { buildContractUsageClientEmail } from "@/lib/resend";
import { getEmailTemplate, applyTemplateVars } from "@/lib/email-templates";
import { sendMailAsSharedMailbox, type SharedMailboxAttachment } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type BlockHoursReportSendResult = {
  sent: number;
  errors: { clientName: string; message: string }[];
};

/** The one CC address every Block of Hours Usage Report send carries —
 * shared across every client on the list, not set per-subscription. */
export async function getBlockHoursReportCc(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from("block_hours_report_settings")
    .select("cc_email")
    .eq("id", true)
    .maybeSingle();
  return data?.cc_email || null;
}

/** Shared by the automated send loop below and the manual "Send to
 * Client" button (Lookups/Reports → Autotask → Block of hrs usage) — one
 * log, regardless of which path actually sent it. */
export async function logBlockHoursReportSend(
  admin: Admin,
  entry: { clientId: string | null; clientName: string; toEmail: string; ccEmail: string | null; error: string | null }
): Promise<void> {
  try {
    await admin.from("block_hours_report_log").insert({
      client_id: entry.clientId,
      client_name: entry.clientName,
      to_email: entry.toEmail,
      cc_email: entry.ccEmail,
      error: entry.error,
    });
  } catch (err) {
    // A logging failure shouldn't be confused with a send failure, or
    // (worse) retried as one — just note it and move on.
    console.error("block-hours-report-send: failed to write log row", err);
  }
}

/** Sends the Block of Hours Usage Report to every client on the
 * subscription list (Settings -> Integrations -> Notifications -> Block
 * of Hours Usage Report) — same PDF/email as the manual "Send to Client"
 * button, just looped over the saved list instead of one client picked by
 * hand, with the shared CC address attached to every send. Called by both
 * the cron route and a manual "Send now" action, one function, two
 * triggers — same reasoning as syncSharedMailboxMessages. No "already
 * sent this period" guard here: cadence is entirely whatever the cron
 * trigger calling this is scheduled for. Every attempt — success or
 * failure — gets a row in block_hours_report_log. */
export async function sendBlockHoursUsageReports(
  admin: Admin = createAdminClient(),
  /** Limits the send to just these subscription rows (the "Send to
   * selected" button) — omitted entirely (the cron trigger, and the
   * "Send now (test)" button) sends to every subscription on the list. */
  subscriptionIds?: string[]
): Promise<BlockHoursReportSendResult> {
  const result: BlockHoursReportSendResult = { sent: 0, errors: [] };

  let query = admin.from("block_hours_report_subscriptions").select("id, to_email, clients(id, name, autotask_company_id)");
  if (subscriptionIds) query = query.in("id", subscriptionIds);
  const { data: subscriptions } = await query;
  if (!subscriptions || subscriptions.length === 0) return result;

  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    result.errors.push({ clientName: "(all)", message: "Autotask isn't connected." });
    return result;
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  const mailboxSettings = mailboxEmail ? await getSharedMailboxSettings(admin) : null;
  if (!mailboxEmail || !mailboxSettings) {
    result.errors.push({ clientName: "(all)", message: "The shared mailbox isn't configured." });
    return result;
  }
  const accessToken = await getValidSharedMailboxToken(admin, mailboxSettings);
  const template = await getEmailTemplate(admin, "contract_usage_report");
  const ccEmail = await getBlockHoursReportCc(admin);

  type SubscriptionRow = {
    id: string;
    to_email: string;
    clients: { id: string; name: string; autotask_company_id: number | null } | { id: string; name: string; autotask_company_id: number | null }[] | null;
  };

  for (const row of subscriptions as SubscriptionRow[]) {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const clientName = client?.name ?? "Unknown client";
    if (!client?.autotask_company_id) {
      const message = "Not linked to an Autotask company.";
      result.errors.push({ clientName, message });
      await logBlockHoursReportSend(admin, { clientId: client?.id ?? null, clientName, toEmail: row.to_email, ccEmail, error: message });
      continue;
    }

    try {
      const rows = await fetchContractUsageForCompany(
        admin,
        settings.credentials,
        settings.zoneUrl,
        client.autotask_company_id
      );
      const pdf = buildContractUsagePdf(clientName, rows);
      const templateVars = { client_name: clientName };
      const { html, text } = buildContractUsageClientEmail(
        clientName,
        rows,
        applyTemplateVars(template.intro, templateVars),
        applyTemplateVars(template.note, templateVars)
      );

      const attachments: SharedMailboxAttachment[] = [
        {
          filename: `${clientName} Block of Hours Usage Report.pdf`,
          contentBase64: pdf.toString("base64"),
          contentType: "application/pdf",
          isInline: false,
        },
      ];
      await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
        to: row.to_email,
        cc: ccEmail,
        subject: applyTemplateVars(template.subject, templateVars),
        html,
        text,
        attachments,
      });
      result.sent += 1;
      await logBlockHoursReportSend(admin, { clientId: client.id, clientName, toEmail: row.to_email, ccEmail, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send.";
      result.errors.push({ clientName, message });
      await logBlockHoursReportSend(admin, { clientId: client.id, clientName, toEmail: row.to_email, ccEmail, error: message });
    }
  }

  return result;
}
