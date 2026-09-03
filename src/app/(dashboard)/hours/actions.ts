"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchResourceHoursSummary, lastBusinessDayBefore, ymd, type ResourceHoursRow } from "@/lib/resource-hours";
import { syncTimeEntriesInRange } from "@/lib/time-entry-sync";
import { getActiveAiSettings } from "@/lib/ai/settings";
import {
  analyzeTimeEntryPatterns,
  type TimeEntryForAnalysis,
  type TimeEntryFinding,
} from "@/lib/time-entry-insights";

/** Live from Autotask, on demand — not synced/stored anywhere, since "hours
 * worked today" is only ever meaningful as of right now, not as a cached
 * value that goes stale the moment someone logs more time. */
export async function fetchResourceHoursAction(): Promise<
  { rows: ResourceHoursRow[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchResourceHoursSummary(settings.credentials, settings.zoneUrl);
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours." };
  }
}

/** Pulls the last business day's time entries into autotask_time_entries
 * on demand — the list on this page reads directly from that table, so
 * this is what actually populates it before a cron is set up (or to
 * backfill a day the cron missed). */
export async function syncYesterdayTimeEntriesAction(): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const dateStr = ymd(lastBusinessDayBefore(new Date()));

  try {
    await syncTimeEntriesInRange(admin, settings.credentials, settings.zoneUrl, dateStr, dateStr);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed." };
  }

  revalidatePath("/hours");
  return { error: null };
}

/** One-time backfill — pulls the past 30 days of Autotask time entries in
 * (this is meant to be run once, to get enough real history for the AI
 * pattern analysis to actually have something to compare; the daily
 * cron/"Sync yesterday" button is what keeps it current after that). */
export async function backfillPastMonthTimeEntriesAction(): Promise<{
  error: string | null;
  synced: number | null;
}> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that.", synced: null };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return {
      error: "Autotask isn't connected yet — set it up under Settings → Integrations.",
      synced: null,
    };
  }

  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);

  try {
    const result = await syncTimeEntriesInRange(
      admin,
      settings.credentials,
      settings.zoneUrl,
      ymd(monthAgo),
      ymd(today)
    );
    revalidatePath("/hours");
    return { error: null, synced: result.synced };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Backfill failed.", synced: null };
  }
}

/** Reads the past 30 days from autotask_time_entries (already stored —
 * this is the whole point of persisting it) and asks the active AI
 * provider to find recurring issues and inconsistent effort across it.
 * This is the piece that actually answers whether keeping time entries
 * persisted is worth it — if it finds nothing real once there's a
 * month of data to look at, it isn't. */
export async function analyzeTimeEntryPatternsAction(): Promise<
  { findings: TimeEntryFinding[]; entryCount: number } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const aiSettings = await getActiveAiSettings(admin);
  if (!aiSettings) {
    return { error: "AI insights aren't set up yet — configure a provider under Settings → Integrations." };
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const { data: rows } = await admin
    .from("autotask_time_entries")
    .select("resource_name, ticket_id, hours_worked, date_worked, summary_notes, clients(name)")
    .gte("date_worked", ymd(since))
    .order("date_worked", { ascending: false });

  if (!rows || rows.length === 0) {
    return { error: "No time entries stored yet — run the backfill above first." };
  }

  const entries: TimeEntryForAnalysis[] = rows.map(
    (r: {
      resource_name: string;
      ticket_id: number | null;
      hours_worked: number;
      date_worked: string;
      summary_notes: string | null;
      clients: unknown;
    }) => ({
      clientName: (r.clients as unknown as { name: string } | null)?.name ?? null,
      resourceName: r.resource_name,
      ticketId: r.ticket_id,
      hoursWorked: r.hours_worked,
      dateWorked: r.date_worked,
      summaryNotes: r.summary_notes,
    })
  );

  try {
    const findings = await analyzeTimeEntryPatterns(entries, aiSettings);
    return { findings, entryCount: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}
