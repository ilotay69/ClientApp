"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";

export type FormState = { error: string | null };

export async function createClientRecord(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      primary_contact_name: emptyToNull(formData.get("primary_contact_name")),
      primary_contact_email: emptyToNull(formData.get("primary_contact_email")),
      primary_contact_phone: emptyToNull(formData.get("primary_contact_phone")),
      notes: emptyToNull(formData.get("notes")),
      owner_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function updateClientRecord(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      primary_contact_name: emptyToNull(formData.get("primary_contact_name")),
      primary_contact_email: emptyToNull(formData.get("primary_contact_email")),
      primary_contact_phone: emptyToNull(formData.get("primary_contact_phone")),
      notes: emptyToNull(formData.get("notes")),
    })
    .eq("id", clientId);

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return { error: null };
}

export async function deleteClientRecord(clientId: string) {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").delete().eq("id", clientId);
  revalidatePath("/clients");
  redirect("/clients");
}

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}
