"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createCatalogItem(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_service_catalog"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const cadenceRaw = String(formData.get("default_cadence_days") ?? "90");
  const cadence = Number(cadenceRaw);
  if (!Number.isFinite(cadence) || cadence <= 0) {
    return { error: "Cadence must be a positive number of days." };
  }

  const { error } = await supabase.from("service_catalog").insert({
    name,
    description: emptyToNull(formData.get("description")),
    default_cadence_days: cadence,
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/services");
  return { error: null };
}

export async function deleteCatalogItem(serviceId: string) {
  if (!(await requirePermission("manage_service_catalog"))) return;

  const supabase = await createClient();
  await supabase.from("service_catalog").delete().eq("id", serviceId);
  revalidatePath("/settings/services");
}

export async function addClientServiceCheck(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_service_catalog"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const serviceId = String(formData.get("service_id") ?? "");
  if (!serviceId) return { error: "Select a service." };

  const cadenceRaw = emptyToNull(formData.get("cadence_days"));

  const { error } = await supabase.from("client_service_checks").insert({
    client_id: clientId,
    service_id: serviceId,
    cadence_days: cadenceRaw ? Number(cadenceRaw) : null,
    assigned_to: emptyToNull(formData.get("assigned_to")),
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function markServiceChecked(checkId: string, clientId: string) {
  if (!(await requirePermission("manage_service_catalog"))) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("client_service_checks")
    .update({
      last_checked_at: new Date().toISOString().slice(0, 10),
      last_checked_by: user?.id ?? null,
    })
    .eq("id", checkId);

  revalidatePath(`/clients/${clientId}`);
}

export async function assignServiceCheck(checkId: string, assignedTo: string | null) {
  if (!(await requirePermission("manage_service_catalog"))) return;

  const supabase = await createClient();
  await supabase.from("client_service_checks").update({ assigned_to: assignedTo }).eq("id", checkId);
  revalidatePath("/clients");
}

export async function removeClientServiceCheck(checkId: string, clientId: string) {
  if (!(await requirePermission("manage_service_catalog"))) return;

  const supabase = await createClient();
  await supabase.from("client_service_checks").delete().eq("id", checkId);
  revalidatePath(`/clients/${clientId}`);
}
