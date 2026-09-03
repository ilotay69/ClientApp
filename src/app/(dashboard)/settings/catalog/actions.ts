"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { ymd } from "@/lib/resource-hours";
import {
  analyzeServiceCoverage,
  type ServiceCoverageCategory,
  type ClientForCoverage,
  type CatalogServiceForCoverage,
} from "@/lib/service-coverage-insights";
import {
  fetchTimeEntriesForAnalysis,
  analyzeTimeEntryPatterns,
  type TimeEntryFinding,
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

export async function attachClientService(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const serviceId = String(formData.get("service_id") ?? "");
  if (!serviceId) return { error: "Select a service." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_services")
    .insert({ client_id: clientId, service_id: serviceId });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function detachClientService(clientId: string, serviceId: string) {
  if (!(await requirePermission("manage_services"))) return;

  const supabase = await createClient();
  await supabase
    .from("client_services")
    .delete()
    .eq("client_id", clientId)
    .eq("service_id", serviceId);
  revalidatePath(`/clients/${clientId}`);
}

/** Reads every client's ACTIVE Autotask contracted services (already
 * synced — nothing to set up or maintain separately) and asks the active
 * AI provider to group them into real categories (MDR, backup, etc.) and
 * flag any client with nothing in a category — even though the exact
 * contracted item differs per client, e.g. a client with "BitDefender"
 * isn't a gap for "Huntress MDR". There's no separate catalog here: the
 * "catalog" is just the union of every distinct service name seen across
 * every client's own contracted services. Nothing stored; fetched and
 * analyzed fresh each time. */
export async function analyzeServiceCoverageAction(): Promise<
  { categories: ServiceCoverageCategory[] } | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const aiSettings = await getActiveAiSettings(admin);
  if (!aiSettings) {
    return { error: "AI insights aren't set up yet — configure a provider under Settings → Integrations." };
  }

  const [{ data: clients }, { data: contractServices }] = await Promise.all([
    admin.from("clients").select("id, name").order("name"),
    admin
      .from("autotask_contract_services")
      .select("client_id, service_name, description, contract_status"),
  ]);

  if (!clients || clients.length === 0) {
    return { error: "No clients to check yet." };
  }
  const activeServices = (contractServices ?? []).filter(
    (cs: { contract_status: string | null }) => cs.contract_status?.toLowerCase() === "active"
  );
  if (activeServices.length === 0) {
    return {
      error:
        "No active Autotask contracted services found across any client — sync Autotask on at least one client first.",
    };
  }

  // The "catalog" here is just every distinct service name seen across
  // every client, each paired with the first description seen for it —
  // there's no separate catalog to maintain, unlike the manual Service
  // Catalog list above.
  const descriptionByServiceName = new Map<string, string | null>();
  const attachedByClientId = new Map<string, string[]>();
  for (const cs of activeServices as {
    client_id: string;
    service_name: string;
    description: string | null;
  }[]) {
    if (!descriptionByServiceName.has(cs.service_name)) {
      descriptionByServiceName.set(cs.service_name, cs.description);
    }
    const existing = attachedByClientId.get(cs.client_id) ?? [];
    existing.push(cs.service_name);
    attachedByClientId.set(cs.client_id, existing);
  }

  const services: CatalogServiceForCoverage[] = [...descriptionByServiceName.entries()]
    .map(([name, description]) => ({ name, description }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const clientsForCoverage: ClientForCoverage[] = clients.map(
    (c: { id: string; name: string }) => ({
      name: c.name,
      attachedServiceNames: [...new Set(attachedByClientId.get(c.id) ?? [])],
    })
  );

  try {
    const categories = await analyzeServiceCoverage(services, clientsForCoverage, aiSettings);
    return { categories };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}

const PATTERN_ANALYSIS_DAYS = 90;

/** Fetches the last 90 days of Autotask time entries live and asks the
 * active AI provider to find recurring issues and inconsistent effort
 * across it — entirely on demand, nothing read from or written to this
 * app's own database beyond the existing client mappings needed to
 * attribute an entry to a client. */
export async function analyzeTimeEntryPatternsAction(): Promise<
  { findings: TimeEntryFinding[]; entryCount: number } | { error: string }
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
    const findings = await analyzeTimeEntryPatterns(entries, aiSettings);
    return { findings, entryCount: entries.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}
