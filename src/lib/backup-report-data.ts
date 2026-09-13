import { createAdminClient } from "@/lib/supabase/server";
import { BACKUP_REPORT_SECTIONS, type BackupItemStatus } from "@/lib/backup-report-sections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type BackupReportItem = {
  id: string;
  sectionKey: string;
  status: BackupItemStatus;
  notes: string | null;
  updatedAt: string;
};

export type BackupReport = {
  id: string;
  reportDate: string;
  completedAt: string | null;
  completedByName: string | null;
  aiAnalysis: string | null;
  aiAnalysisAt: string | null;
  emailedAt: string | null;
  items: BackupReportItem[];
};

/** Fetches the report for one date, creating it (with every current section
 * pre-seeded as "pending") if it doesn't exist yet — so the checklist form
 * always has a row per section to render, even on a brand-new day, without
 * a separate "start today's report" step. */
export async function getOrCreateBackupReport(dateStr: string, admin: AdminClient = createAdminClient()): Promise<BackupReport> {
  const { data: existing } = await admin
    .from("backup_reports")
    .select(
      "id, report_date, completed_at, ai_analysis, ai_analysis_at, emailed_at, profiles:completed_by(full_name), backup_report_items(id, section_key, status, notes, updated_at)"
    )
    .eq("report_date", dateStr)
    .maybeSingle();

  if (existing) {
    return mapReport(existing);
  }

  const { data: created, error } = await admin
    .from("backup_reports")
    .insert({ report_date: dateStr })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't create backup report: ${error.message}`);

  await admin.from("backup_report_items").insert(
    BACKUP_REPORT_SECTIONS.map((s) => ({ report_id: created.id, section_key: s.key, status: "pending" }))
  );

  const { data: fresh } = await admin
    .from("backup_reports")
    .select(
      "id, report_date, completed_at, ai_analysis, ai_analysis_at, emailed_at, profiles:completed_by(full_name), backup_report_items(id, section_key, status, notes, updated_at)"
    )
    .eq("id", created.id)
    .single();

  return mapReport(fresh);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReport(row: any): BackupReport {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const itemBySectionKey = new Map<string, BackupReportItem>(
    (row.backup_report_items ?? []).map((i: { id: string; section_key: string; status: BackupItemStatus; notes: string | null; updated_at: string }) => [
      i.section_key,
      { id: i.id, sectionKey: i.section_key, status: i.status, notes: i.notes, updatedAt: i.updated_at },
    ])
  );
  // Always in the current section order, even if items came back from the
  // DB in insert order or a section was added after this report existed
  // (that section just shows as a fresh "pending" row, id "" — saving it
  // creates the row on first use via saveBackupReportItemAction's upsert).
  const items: BackupReportItem[] = BACKUP_REPORT_SECTIONS.map((s) => {
    const existing = itemBySectionKey.get(s.key);
    return existing ?? { id: "", sectionKey: s.key, status: "pending", notes: null, updatedAt: row.report_date };
  });

  return {
    id: row.id,
    reportDate: row.report_date,
    completedAt: row.completed_at,
    completedByName: profile?.full_name ?? null,
    aiAnalysis: row.ai_analysis,
    aiAnalysisAt: row.ai_analysis_at,
    emailedAt: row.emailed_at,
    items,
  };
}

/** Every report in the last N days, oldest first — the AI analysis prompt's
 * own input, and also the history list's data source. */
export async function fetchRecentBackupReports(
  days: number,
  admin: AdminClient = createAdminClient()
): Promise<BackupReport[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data } = await admin
    .from("backup_reports")
    .select(
      "id, report_date, completed_at, ai_analysis, ai_analysis_at, emailed_at, profiles:completed_by(full_name), backup_report_items(id, section_key, status, notes, updated_at)"
    )
    .gte("report_date", sinceStr)
    .order("report_date", { ascending: true });

  return ((data ?? []) as unknown[]).map(mapReport);
}

export async function fetchBackupReportRecipientEmail(
  admin: AdminClient = createAdminClient()
): Promise<string | null> {
  const { data } = await admin
    .from("backup_report_settings")
    .select("recipient_email")
    .eq("id", true)
    .maybeSingle();
  return data?.recipient_email ?? null;
}
