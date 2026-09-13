"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { BACKUP_REPORT_SECTIONS, type BackupItemStatus } from "@/lib/backup-report-sections";
import { getOrCreateBackupReport, fetchRecentBackupReports, fetchBackupReportRecipientEmail } from "@/lib/backup-report-data";
import { generateBackupAnalysis } from "@/lib/backup-analysis";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { buildBackupReportEmail } from "@/lib/resend";
import { sendMailAsSharedMailbox } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";

/** Inline auto-save per section, same shape as the resume screener's status
 * selects — no separate "save" button per row. */
export async function saveBackupReportItemAction(
  reportId: string,
  sectionKey: string,
  status: BackupItemStatus,
  notes: string | null
): Promise<void> {
  const user = await requirePermission("manage_backups");
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("backup_report_items").upsert(
    {
      report_id: reportId,
      section_key: sectionKey,
      status,
      notes,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "report_id,section_key" }
  );
  revalidatePath("/backups");
}

export async function saveBackupRecipientEmailAction(email: string | null): Promise<void> {
  const user = await requirePermission("manage_backups");
  if (!user) return;

  const admin = createAdminClient();
  await admin
    .from("backup_report_settings")
    .update({ recipient_email: email, updated_by: user.id })
    .eq("id", true);
  revalidatePath("/backups");
}

export type CompleteBackupReportState = { ok: boolean; message: string };

/**
 * Marks the day's report complete, regenerates the rolling 2-week AI
 * analysis, and emails the recipient set in settings — each of the AI and
 * email steps is best-effort and independently wrapped, since neither an
 * unconfigured AI provider nor a misconfigured mailbox should block marking
 * the day's checklist done.
 */
export async function completeBackupReportAction(reportDate: string): Promise<CompleteBackupReportState> {
  const user = await requirePermission("manage_backups");
  if (!user) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const report = await getOrCreateBackupReport(reportDate, admin);

  await admin
    .from("backup_reports")
    .update({ completed_at: new Date().toISOString(), completed_by: user.id })
    .eq("id", report.id);

  let aiAnalysis: string | null = report.aiAnalysis;
  try {
    const settings = await getActiveAiSettings(admin);
    if (settings) {
      const recentReports = await fetchRecentBackupReports(14, admin);
      const analysis = await generateBackupAnalysis(
        recentReports.map((r) => ({
          reportDate: r.reportDate,
          items: r.items.map((i) => ({ sectionKey: i.sectionKey, status: i.status, notes: i.notes })),
        })),
        settings
      );
      if (analysis) {
        aiAnalysis = analysis;
        await admin
          .from("backup_reports")
          .update({ ai_analysis: analysis, ai_analysis_at: new Date().toISOString() })
          .eq("id", report.id);
      }
    }
  } catch (err) {
    console.error("completeBackupReportAction: analysis failed", err);
  }

  let emailNote = "";
  try {
    const recipientEmail = await fetchBackupReportRecipientEmail(admin);
    const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
    if (!recipientEmail) {
      emailNote = " No recipient email set, so nothing was sent.";
    } else if (!mailboxEmail) {
      emailNote = " The shared mailbox isn't configured, so nothing was sent.";
    } else {
      const sharedSettings = await getSharedMailboxSettings(admin);
      if (!sharedSettings) {
        emailNote = " The shared mailbox integration isn't set up yet, so nothing was sent.";
      } else {
        const accessToken = await getValidSharedMailboxToken(admin, sharedSettings);
        const emailItems = report.items.map((i) => {
          const section = BACKUP_REPORT_SECTIONS.find((s) => s.key === i.sectionKey);
          return {
            label: section?.label ?? i.sectionKey,
            okLabel: section?.okLabel ?? "OK",
            status: i.status,
            notes: i.notes,
          };
        });
        const { html, text } = buildBackupReportEmail(reportDate, emailItems, aiAnalysis);
        await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
          to: recipientEmail,
          subject: `Daily Backup Report — ${reportDate}`,
          html,
          text,
        });
        await admin.from("backup_reports").update({ emailed_at: new Date().toISOString() }).eq("id", report.id);
        emailNote = ` Emailed to ${recipientEmail}.`;
      }
    }
  } catch (err) {
    console.error("completeBackupReportAction: email failed", err);
    emailNote = " Emailing it failed — check the shared mailbox settings.";
  }

  revalidatePath("/backups");
  return { ok: true, message: `Report completed.${emailNote}` };
}
