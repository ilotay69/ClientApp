"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getActiveAiSettings } from "@/lib/ai/settings";
import {
  analyzeServiceCoverage,
  type ServiceCoverageGap,
  type ClientForCoverage,
} from "@/lib/service-coverage-insights";

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

/** Reads the catalog and every client's attached services, and asks the
 * active AI provider to group services into real categories (MDR, backup,
 * etc.) and flag any client with nothing attached in a category — even
 * though the exact catalog entries differ per client, e.g. a client with
 * "SentinelOne MDR" isn't a gap for "Huntress MDR". Nothing stored;
 * fetched and analyzed on demand each time. */
export async function analyzeServiceCoverageAction(): Promise<
  { gaps: ServiceCoverageGap[] } | { error: string }
> {
  if (!(await requirePermission("manage_services"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const aiSettings = await getActiveAiSettings(admin);
  if (!aiSettings) {
    return { error: "AI insights aren't set up yet — configure a provider under Settings → Integrations." };
  }

  const [{ data: services }, { data: clients }, { data: clientServices }] = await Promise.all([
    admin.from("services").select("name, description").order("name"),
    admin.from("clients").select("id, name").order("name"),
    admin.from("client_services").select("client_id, services(name)"),
  ]);

  if (!services || services.length === 0) {
    return { error: "Add at least one service to the catalog first." };
  }
  if (!clients || clients.length === 0) {
    return { error: "No clients to check yet." };
  }

  const attachedByClientId = new Map<string, string[]>();
  for (const cs of clientServices ?? []) {
    const serviceName = (cs.services as unknown as { name: string } | null)?.name;
    if (!serviceName) continue;
    const existing = attachedByClientId.get(cs.client_id) ?? [];
    existing.push(serviceName);
    attachedByClientId.set(cs.client_id, existing);
  }

  const clientsForCoverage: ClientForCoverage[] = clients.map(
    (c: { id: string; name: string }) => ({
      name: c.name,
      attachedServiceNames: attachedByClientId.get(c.id) ?? [],
    })
  );

  try {
    const gaps = await analyzeServiceCoverage(services, clientsForCoverage, aiSettings);
    return { gaps };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Analysis failed." };
  }
}
