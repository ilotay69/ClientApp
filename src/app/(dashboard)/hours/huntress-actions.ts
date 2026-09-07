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
import { fetchRecentHuntressSiemLogs, type HuntressSiemLogRow } from "@/lib/huntress";

const SIEM_WINDOW_HOURS = 24;

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

/** Account-wide only — Huntress's SIEM query API has no confirmed field
 * to filter by client/organization yet. A 404 here specifically means
 * "the SIEM add-on isn't enabled for this Huntress account", not a
 * generic failure. */
export async function fetchHuntressSiemLogsAction(): Promise<
  { rows: HuntressSiemLogRow[] } | { error: string }
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
    return { rows: await fetchRecentHuntressSiemLogs(settings, SIEM_WINDOW_HOURS) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load SIEM logs." };
  }
}
