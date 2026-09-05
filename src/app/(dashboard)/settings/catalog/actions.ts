"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { ymd } from "@/lib/resource-hours";
import {
  fetchTimeEntriesForAnalysis,
  analyzeTimeEntryPatterns,
  type ClientPatternReport,
} from "@/lib/time-entry-insights";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createServiceOffering(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const { error } = await supabase.from("services").insert({
    name,
    description: emptyToNull(formData.get("description")),
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/catalog");
  return { error: null };
}

export async function deleteServiceOffering(serviceId: string) {
  if (!(await requirePermission("manage_services"))) return;

  const supabase = await createClient();
  await supabase.from("services").delete().eq("id", serviceId);
  revalidatePath("/settings/catalog");
  revalidatePath("/clients");
}

/** Client list for the sales-opportunity picker — id/name only, cheap. */
export async function getClientsForServiceGapsAction(): Promise<
  { id: string; name: string }[] | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const { data: clients } = await admin.from("clients").select("id, name").order("name");
  return clients ?? [];
}

export type ClientServiceGap = { serviceName: string; otherClientCount: number };

/** Deterministic, no AI: for one client, every distinct ACTIVE Autotask
 * contracted service name that at least one OTHER client has and this
 * one doesn't — sorted by how many other clients have it, so the
 * strongest upsell signal (something almost everyone else has) sorts
 * first. Exact service-name comparison, not cross-vendor category
 * matching — an AI-judgment version of this kept collapsing everything
 * into broad umbrella categories that hid real gaps, so this trades that
 * "different vendor, same protection" nuance for something that reliably
 * finds gaps at all; a human reviewing the list can tell "Huntress MDR"
 * isn't a real gap for a client that already has "SentinelOne MDR". */
export async function getClientServiceGapsAction(clientId: string): Promise<
  { clientName: string; gaps: ClientServiceGap[] } | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const [{ data: client }, { data: contractServices }] = await Promise.all([
    admin.from("clients").select("id, name").eq("id", clientId).single(),
    admin
      .from("autotask_contract_services")
      .select("client_id, service_name, contract_status"),
  ]);
  if (!client) return { error: "Client not found." };

  const active = (contractServices ?? []).filter(
    (cs: { contract_status: string | null }) => cs.contract_status?.toLowerCase() === "active"
  ) as { client_id: string; service_name: string }[];

  if (active.length === 0) {
    return {
      error:
        "No active Autotask contracted services found across any client — sync Autotask on at least one client first.",
    };
  }

  const thisClientServices = new Set(
    active.filter((cs) => cs.client_id === clientId).map((cs) => cs.service_name)
  );

  const otherClientIdsByService = new Map<string, Set<string>>();
  for (const cs of active) {
    if (cs.client_id === clientId) continue;
    const set = otherClientIdsByService.get(cs.service_name) ?? new Set<string>();
    set.add(cs.client_id);
    otherClientIdsByService.set(cs.service_name, set);
  }

  const gaps: ClientServiceGap[] = [...otherClientIdsByService.entries()]
    .filter(([serviceName]) => !thisClientServices.has(serviceName))
    .map(([serviceName, clientIds]) => ({ serviceName, otherClientCount: clientIds.size }))
    .sort((a, b) => b.otherClientCount - a.otherClientCount);

  return { clientName: client.name, gaps };
}

const PATTERN_ANALYSIS_DAYS = 90;

/** Fetches the last 90 days of Autotask time entries live and asks the
 * active AI provider to find recurring issues and inconsistent effort
 * across it — entirely on demand, nothing read from or written to this
 * app's own database beyond the existing client mappings needed to
 * attribute an entry to a client. */
export async function analyzeTimeEntryPatternsAction(): Promise<
  { clients: ClientPatternReport[]; entryCount: number } | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
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
    const clients = await analyzeTimeEntryPatterns(entries, aiSettings);
    return { clients, entryCount: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}
