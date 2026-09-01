"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { searchAutotaskCompanies, type AutotaskCompany } from "@/lib/autotask";
import { getAutotaskSettings } from "@/lib/autotask-settings";

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

export async function addClientContact(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Contact name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("client_contacts").insert({
    client_id: clientId,
    name,
    email: emptyToNull(formData.get("email")),
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function removeClientContact(clientId: string, contactId: string) {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("client_contacts").delete().eq("id", contactId);
  revalidatePath(`/clients/${clientId}`);
}

/** Logging a Note/Call/Meeting is open to any signed-in user — matches how
 * touchpoints/tasks work today; only editing the client record itself and
 * managing its contact list require manage_clients. */
export async function logClientInteraction(
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Enter a note or summary." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("client_interactions").insert({
    client_id: clientId,
    contact_id: emptyToNull(formData.get("contact_id")),
    type: String(formData.get("type") ?? "note"),
    subject: emptyToNull(formData.get("subject")),
    body,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

/** Name search against Autotask Companies, for the client-mapping UI on the
 * Tickets tab. Returns an error string instead of throwing so the client
 * component can render it inline. */
export async function searchAutotaskCompaniesAction(
  query: string
): Promise<{ companies: AutotaskCompany[] } | { error: string }> {
  if (!(await requirePermission("manage_clients"))) {
    return { error: "You don't have permission to do that." };
  }
  if (!query.trim()) return { companies: [] };

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const companies = await searchAutotaskCompanies(settings.credentials, settings.zoneUrl, query);
    return { companies };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Autotask search failed." };
  }
}

export async function linkClientAutotaskCompany(
  clientId: string,
  companyId: number
): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ autotask_company_id: companyId }).eq("id", clientId);
  revalidatePath(`/clients/${clientId}`);
}

export async function unlinkClientAutotaskCompany(clientId: string): Promise<void> {
  if (!(await requirePermission("manage_clients"))) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ autotask_company_id: null }).eq("id", clientId);
  await supabase.from("autotask_tickets").delete().eq("client_id", clientId);
  revalidatePath(`/clients/${clientId}`);
}
