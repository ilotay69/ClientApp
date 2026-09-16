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

/** Sends the Block of Hours Usage Report to every client on the
 * subscription list (Settings -> Integrations -> Notifications -> Block
 * of Hours Usage Report) — same PDF/email as the manual "Send to Client"
 * button, just looped over the saved list instead of one client picked by
 * hand. Called by both the cron route and a manual "Send now" action, one
 * function, two triggers — same reasoning as syncSharedMailboxMessages.
 * No "already sent this period" guard here: cadence is entirely whatever
 * the cron trigger calling this is scheduled for. */
export async function sendBlockHoursUsageReports(
  admin: Admin = createAdminClient()
): Promise<BlockHoursReportSendResult> {
  const result: BlockHoursReportSendResult = { sent: 0, errors: [] };

  const { data: subscriptions } = await admin
    .from("block_hours_report_subscriptions")
    .select("id, to_email, cc_email, clients(id, name, autotask_company_id)");
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

  type SubscriptionRow = {
    id: string;
    to_email: string;
    cc_email: string | null;
    clients: { id: string; name: string; autotask_company_id: number | null } | { id: string; name: string; autotask_company_id: number | null }[] | null;
  };

  for (const row of subscriptions as SubscriptionRow[]) {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const clientName = client?.name ?? "Unknown client";
    if (!client?.autotask_company_id) {
      result.errors.push({ clientName, message: "Not linked to an Autotask company." });
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
        applyTemplateVars(template.intro, templateVars)
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
        cc: row.cc_email,
        subject: applyTemplateVars(template.subject, templateVars),
        html,
        text,
        attachments,
      });
      result.sent += 1;
    } catch (err) {
      result.errors.push({
        clientName,
        message: err instanceof Error ? err.message : "Failed to send.",
      });
    }
  }

  return result;
}
