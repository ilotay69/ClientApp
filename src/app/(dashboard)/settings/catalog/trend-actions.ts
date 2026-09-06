"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchActiveResources } from "@/lib/autotask";
import { fetchClientHoursTrend, type WeeklyPoint } from "@/lib/client-hours-trend";
import { fetchResourceHoursTrend } from "@/lib/resource-hours-trend";
import { fetchResourceClientPairs, type ResourceClientPairRow } from "@/lib/resource-client-pairs";
import { fetchTicketVolumeTrend } from "@/lib/ticket-volume-trend";
import {
  fetchActiveBlockOptions,
  fetchContractBurndown,
  type BlockOption,
} from "@/lib/contract-burndown";

const MAX_TREND_WEEKS = 104;

function clampWeeks(weeks: number): number {
  return Math.min(Math.max(Math.trunc(weeks) || 1, 1), MAX_TREND_WEEKS);
}

/** Resource list for the utilization-trend picker — mirrors
 * getClientsForAnalysisAction's shape/permission for the client pickers on
 * this same page. */
export async function getResourcesForAnalysisAction(): Promise<
  { id: string; name: string }[] | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    const resources = await fetchActiveResources(settings.credentials, settings.zoneUrl);
    return resources.map((r) => ({ id: String(r.id), name: r.name }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load resources." };
  }
}

export async function getClientHoursTrendAction(
  clientId: string,
  weeks: number
): Promise<{ points: WeeklyPoint[] } | { error: string }> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    const points = await fetchClientHoursTrend(admin, settings.credentials, settings.zoneUrl, clientId, clampWeeks(weeks));
    return { points };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours trend." };
  }
}

export async function getResourceHoursTrendAction(
  resourceId: string,
  weeks: number
): Promise<{ points: WeeklyPoint[] } | { error: string }> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  const numericId = Number(resourceId);
  if (!Number.isFinite(numericId)) return { error: "Invalid resource." };
  try {
    const points = await fetchResourceHoursTrend(settings.credentials, settings.zoneUrl, numericId, clampWeeks(weeks));
    return { points };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours trend." };
  }
}

const MAX_LOOKUP_DAYS = 365;

export async function getResourceClientPairsAction(
  days: number
): Promise<{ rows: ResourceClientPairRow[] } | { error: string }> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  const clampedDays = Math.min(Math.max(Math.trunc(days) || 1, 1), MAX_LOOKUP_DAYS);
  try {
    const rows = await fetchResourceClientPairs(admin, settings.credentials, settings.zoneUrl, clampedDays);
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load resource/client data." };
  }
}

export async function getTicketVolumeTrendAction(
  clientId: string,
  weeks: number
): Promise<{ points: WeeklyPoint[] } | { error: string }> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    const points = await fetchTicketVolumeTrend(admin, settings.credentials, settings.zoneUrl, clientId, clampWeeks(weeks));
    return { points };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load ticket volume trend." };
  }
}

/** Active contract block list for the burn-down picker. */
export async function getActiveBlockOptionsAction(): Promise<
  { blocks: BlockOption[] } | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    const blocks = await fetchActiveBlockOptions(admin, settings.credentials, settings.zoneUrl);
    return { blocks };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load contract blocks." };
  }
}

export async function getContractBurndownAction(
  blockId: number
): Promise<{ points: WeeklyPoint[]; purchased: number; clientName: string } | { error: string }> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  try {
    const blocks = await fetchActiveBlockOptions(admin, settings.credentials, settings.zoneUrl);
    const block = blocks.find((b) => b.blockId === blockId);
    if (!block) return { error: "That contract block is no longer active." };
    const points = await fetchContractBurndown(settings.credentials, settings.zoneUrl, block);
    return { points, purchased: block.purchased, clientName: block.clientName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load contract burn-down." };
  }
}
