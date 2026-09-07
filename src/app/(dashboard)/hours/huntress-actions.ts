"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getHuntressSettings } from "@/lib/huntress-settings";
import {
  fetchHuntressAgentAlerts,
  fetchHuntressOpenIncidents,
  type HuntressAgentAlertRow,
  type HuntressOpenIncidentRow,
} from "@/lib/huntress-lookups";
import { fetchHuntressSiemLogs, type HuntressSiemLogRow } from "@/lib/huntress";

export async function fetchHuntressAgentAlertsAction(): Promise<
  { rows: HuntressAgentAlertRow[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getHuntressSettings(admin);
  if (!settings) {
    return { error: "Huntress isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    return { rows: await fetchHuntressAgentAlerts(settings) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load agent health." };
  }
}

export async function fetchHuntressOpenIncidentsAction(): Promise<
  { rows: HuntressOpenIncidentRow[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getHuntressSettings(admin);
  if (!settings) {
    return { error: "Huntress isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    return { rows: await fetchHuntressOpenIncidents(settings) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load open incidents." };
  }
}

const MAX_SIEM_MINUTES = 24 * 60;

/** Account-wide only — Huntress's SIEM query API has no confirmed field
 * to filter by client/organization yet. Takes the ESQL query and time
 * window from the caller rather than a fixed default: a 24-hour window
 * 413'd with "Query exceeded memory limit" even after narrowing columns
 * and adding LIMIT 100, meaning the memory cost is in the scan itself,
 * before LIMIT ever applies — there's no single safe default across
 * accounts with different log volumes, so this is a real query tool
 * (edit and retry), not a fixed report. A 404 specifically means "the
 * SIEM add-on isn't enabled for this Huntress account", not a generic
 * failure. */
export async function fetchHuntressSiemLogsAction(
  esql: string,
  minutesBack: number
): Promise<{ rows: HuntressSiemLogRow[] } | { error: string }> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!esql.trim().toUpperCase().startsWith("FROM LOGS")) {
    return { error: "Query must start with FROM logs." };
  }

  const admin = createAdminClient();
  const settings = await getHuntressSettings(admin);
  if (!settings) {
    return { error: "Huntress isn't connected yet — set it up under Settings → Integrations." };
  }

  const clampedMinutes = Math.min(Math.max(Math.trunc(minutesBack) || 1, 1), MAX_SIEM_MINUTES);
  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - clampedMinutes * 60_000);

  try {
    return { rows: await fetchHuntressSiemLogs(settings, esql, rangeStart.toISOString(), rangeEnd.toISOString()) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load SIEM logs." };
  }
}
