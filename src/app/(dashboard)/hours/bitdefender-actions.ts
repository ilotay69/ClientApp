"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getBitdefenderSettings } from "@/lib/bitdefender-settings";
import {
  fetchGravityZoneEndpointInventory,
  fetchGravityZoneOpenIncidents,
  type BitdefenderEndpointRow,
  type BitdefenderOpenIncidentRow,
} from "@/lib/bitdefender-lookups";

export async function fetchGravityZoneEndpointsAction(): Promise<
  { rows: BitdefenderEndpointRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getBitdefenderSettings(admin);
  if (!settings) {
    return { error: "Bitdefender GravityZone isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    return { rows: await fetchGravityZoneEndpointInventory(settings) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load endpoints." };
  }
}

export async function fetchGravityZoneOpenIncidentsAction(): Promise<
  { rows: BitdefenderOpenIncidentRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getBitdefenderSettings(admin);
  if (!settings) {
    return { error: "Bitdefender GravityZone isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    return { rows: await fetchGravityZoneOpenIncidents(settings) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load incidents." };
  }
}
