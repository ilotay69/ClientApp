"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";

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
