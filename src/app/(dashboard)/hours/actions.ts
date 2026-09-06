"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import {
  fetchResourceHoursSummary,
  fetchHoursByGroup,
  lastBusinessDayBefore,
  ymd,
  type ResourceHoursRow,
  type HoursByGroupRow,
} from "@/lib/resource-hours";
import { fetchTimeEntriesForAnalysis, type TimeEntryForAnalysis } from "@/lib/time-entry-insights";

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

const MAX_LOOKUP_DAYS = 365;

/** Flexible "last N days" lookup, by client or by resource — live from
 * Autotask, nothing stored. Days is clamped so an accidental huge number
 * doesn't turn into a very slow, very large Autotask pull. */
export async function fetchHoursByGroupAction(
  groupBy: "client" | "resource",
  days: number
): Promise<{ rows: HoursByGroupRow[] } | { error: string }> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }

  const clampedDays = Math.min(Math.max(Math.trunc(days) || 1, 1), MAX_LOOKUP_DAYS);

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchHoursByGroup(
      admin,
      settings.credentials,
      settings.zoneUrl,
      groupBy,
      clampedDays
    );
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours." };
  }
}

/** The itemized list behind the summary numbers above — every individual
 * time entry logged on the last business day, live from Autotask, nothing
 * stored. "Yesterday" is the last business day, same definition as the
 * summary report (a Monday shows Friday's entries, not Sunday's). */
export async function fetchYesterdayTimeEntriesAction(): Promise<
  { entries: TimeEntryForAnalysis[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const yesterdayStr = ymd(lastBusinessDayBefore(new Date()));

  try {
    const entries = await fetchTimeEntriesForAnalysis(
      admin,
      settings.credentials,
      settings.zoneUrl,
      yesterdayStr,
      yesterdayStr
    );
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load time entries." };
  }
}
