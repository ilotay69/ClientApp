"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getNinjaOneSettings, getValidNinjaOneToken } from "@/lib/ninjaone-settings";
import {
  fetchOfflineDevicesAccountWide,
  fetchDiskAlertsAccountWide,
  fetchAgingHardwareAccountWide,
  fetchOsEolAccountWide,
  type OfflineDeviceRow,
  type DiskAlertRow,
  type AgingHardwareRow,
  type OsEolRow,
} from "@/lib/device-lookups";
import {
  fetchAntivirusAlertsAccountWide,
  fetchMissingPatchesAccountWide,
  type AntivirusAlertRow,
  type MissingPatchRow,
} from "@/lib/device-security-lookups";

/** These four are plain reads of the ninjaone_devices table (synced hourly
 * by the ninjaone-sync cron) — no live NinjaOne call, so no
 * "isn't connected" guard is needed beyond the permission check. */
export async function fetchOfflineDevicesAction(): Promise<
  { rows: OfflineDeviceRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  try {
    return { rows: await fetchOfflineDevicesAccountWide(admin) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load offline devices." };
  }
}

export async function fetchDiskAlertsAction(): Promise<{ rows: DiskAlertRow[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  try {
    return { rows: await fetchDiskAlertsAccountWide(admin) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load disk alerts." };
  }
}

export async function fetchAgingHardwareAction(): Promise<
  { rows: AgingHardwareRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  try {
    return { rows: await fetchAgingHardwareAccountWide(admin) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load aging hardware." };
  }
}

export async function fetchOsEolAction(): Promise<{ rows: OsEolRow[] } | { error: string }> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  try {
    return { rows: await fetchOsEolAccountWide(admin) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load OS end-of-life data." };
  }
}

/** These two need a live per-organization NinjaOne call (antivirus/patch
 * status isn't synced into ninjaone_devices), so — like the Autotask
 * lookups — they need the integration connected. */
export async function fetchAntivirusAlertsAction(): Promise<
  { rows: AntivirusAlertRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getNinjaOneSettings(admin);
  if (!settings) {
    return { error: "NinjaOne isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    const token = await getValidNinjaOneToken(admin, settings);
    return { rows: await fetchAntivirusAlertsAccountWide(admin, settings.credentials, token) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load antivirus status." };
  }
}

export async function fetchMissingPatchesAction(): Promise<
  { rows: MissingPatchRow[] } | { error: string }
> {
  if (!(await requirePermission("view_lookups"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getNinjaOneSettings(admin);
  if (!settings) {
    return { error: "NinjaOne isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    const token = await getValidNinjaOneToken(admin, settings);
    return { rows: await fetchMissingPatchesAccountWide(admin, settings.credentials, token) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load patch status." };
  }
}
