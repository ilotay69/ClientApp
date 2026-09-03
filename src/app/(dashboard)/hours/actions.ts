"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchResourceHoursSummary, ymd, type ResourceHoursRow } from "@/lib/resource-hours";
import { getActiveAiSettings } from "@/lib/ai/settings";
import {
  fetchTimeEntriesForAnalysis,
  analyzeTimeEntryPatterns,
  type TimeEntryFinding,
} from "@/lib/time-entry-insights";

const PATTERN_ANALYSIS_DAYS = 90;

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

/** Fetches the last 90 days of Autotask time entries live and asks the
 * active AI provider to find recurring issues and inconsistent effort
 * across it — entirely on demand, nothing read from or written to this
 * app's own database beyond the existing client mappings needed to
 * attribute an entry to a client. */
export async function analyzeTimeEntryPatternsAction(): Promise<
  { findings: TimeEntryFinding[]; entryCount: number } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const [aiSettings, autotaskSettings] = await Promise.all([
    getActiveAiSettings(admin),
    getAutotaskSettings(admin),
  ]);
  if (!aiSettings) {
    return { error: "AI insights aren't set up yet — configure a provider under Settings → Integrations." };
  }
  if (!autotaskSettings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - PATTERN_ANALYSIS_DAYS);

  try {
    const entries = await fetchTimeEntriesForAnalysis(
      admin,
      autotaskSettings.credentials,
      autotaskSettings.zoneUrl,
      ymd(since),
      ymd(today)
    );
    if (entries.length === 0) {
      return { error: "No time entries found in Autotask for the past 90 days." };
    }
    const findings = await analyzeTimeEntryPatterns(entries, aiSettings);
    return { findings, entryCount: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}
