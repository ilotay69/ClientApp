"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchResourceHoursSummary, lastBusinessDayBefore, ymd, type ResourceHoursRow } from "@/lib/resource-hours";
import { syncTimeEntriesForDate } from "@/lib/time-entry-sync";

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
    await syncTimeEntriesForDate(admin, settings.credentials, settings.zoneUrl, dateStr);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed." };
  }

  revalidatePath("/hours");
  return { error: null };
}
