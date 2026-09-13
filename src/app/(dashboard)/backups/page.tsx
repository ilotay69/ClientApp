import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { BACKUP_REPORT_SECTIONS } from "@/lib/backup-report-sections";
import {
  getOrCreateBackupReport,
  fetchRecentBackupReports,
  fetchBackupReportRecipientEmail,
} from "@/lib/backup-report-data";
import {
  saveBackupReportItemAction,
  saveBackupRecipientEmailAction,
  completeBackupReportAction,
} from "./actions";
import { BackupRecipientEmailField } from "@/components/backup-recipient-email-field";
import { BackupChecklistItem } from "@/components/backup-checklist-item";
import { AsyncActionButton } from "@/components/sync-resumes-button";

export const dynamic = "force-dynamic";

/** Today's date as staff would call it — Toronto local, not UTC — so the
 * daily boundary matches the business day the checklist is actually filled
 * in during, not midnight UTC. */
function todayInToronto(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function BackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_backups"))) {
    redirect("/dashboard");
  }

  const { date: dateParam } = await searchParams;
  const today = todayInToronto();
  const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  const [report, recipientEmail, recentReports] = await Promise.all([
    getOrCreateBackupReport(selectedDate),
    fetchBackupReportRecipientEmail(),
    fetchRecentBackupReports(14),
  ]);

  const historyDates = [...recentReports].reverse(); // newest first for the picker row

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Daily Backup Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fill this in each day instead of emailing the checklist — it's kept as history, and
            completing a day's report sends this same content (plus a rolling 2-week AI read) to
            the address below.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Send completed reports to</label>
          <div className="mt-1">
            <BackupRecipientEmailField value={recipientEmail} action={saveBackupRecipientEmailAction} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/backups?date=${addDaysISO(selectedDate, -1)}`}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Previous day
        </Link>
        <span className="text-sm font-medium text-slate-900">
          {formatDate(selectedDate)}
          {selectedDate === today && " (Today)"}
        </span>
        {selectedDate !== today && (
          <Link
            href={`/backups?date=${addDaysISO(selectedDate, 1)}`}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Next day →
          </Link>
        )}
        {selectedDate !== today && (
          <Link href="/backups" className="text-sm font-medium text-brand underline">
            Jump to today
          </Link>
        )}
        {report.completedAt && (
          <span className="text-xs text-emerald-700">
            Completed {formatDate(report.completedAt)}
            {report.completedByName ? ` by ${report.completedByName}` : ""}
            {report.emailedAt ? " · emailed" : ""}
          </span>
        )}
      </div>

      {historyDates.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {historyDates.map((r) => (
            <Link
              key={r.reportDate}
              href={`/backups?date=${r.reportDate}`}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                r.reportDate === selectedDate
                  ? "bg-charcoal text-white"
                  : r.completedAt
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r.reportDate.slice(5)}
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {BACKUP_REPORT_SECTIONS.map((section) => {
          const item = report.items.find((i) => i.sectionKey === section.key)!;
          return (
            <BackupChecklistItem
              key={section.key}
              reportId={report.id}
              sectionKey={section.key}
              label={section.label}
              instructions={section.instructions}
              okLabel={section.okLabel}
              status={item.status}
              notes={item.notes}
              action={saveBackupReportItemAction}
            />
          );
        })}
      </div>

      <AsyncActionButton
        label="Complete & Email Report"
        pendingLabel="Completing…"
        action={completeBackupReportAction.bind(null, selectedDate)}
      />

      {report.aiAnalysis && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            AI analysis — last 2 weeks
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{report.aiAnalysis}</p>
          {report.aiAnalysisAt && (
            <p className="mt-2 text-xs text-indigo-400">Generated {formatDate(report.aiAnalysisAt)}</p>
          )}
        </div>
      )}
    </div>
  );
}
