"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TouchpointType } from "@/lib/types";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseTouchpointFields(formData: FormData) {
  return {
    client_id: String(formData.get("client_id") ?? ""),
    type: String(formData.get("type") ?? "personal_checkin") as TouchpointType,
    due_date: String(formData.get("due_date") ?? ""),
    notes: emptyToNull(formData.get("notes")),
  };
}

export async function createTouchpoint(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fields = parseTouchpointFields(formData);
  if (!fields.client_id) return { error: "Select a client." };
  if (!fields.due_date) return { error: "Due date is required." };

  const { data, error } = await supabase
    .from("touchpoints")
    .insert({ ...fields, owner_id: user?.id ?? null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/touchpoints");
  revalidatePath(`/clients/${fields.client_id}`);
  redirect(`/touchpoints/${data.id}`);
}

export async function updateTouchpoint(
  touchpointId: string,
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const fields = parseTouchpointFields(formData);
  if (!fields.due_date) return { error: "Due date is required." };

  const { error } = await supabase
    .from("touchpoints")
    .update(fields)
    .eq("id", touchpointId);

  if (error) return { error: error.message };

  revalidatePath(`/touchpoints/${touchpointId}`);
  revalidatePath("/touchpoints");
  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function toggleTouchpointComplete(
  touchpointId: string,
  clientId: string,
  isComplete: boolean
) {
  const supabase = await createClient();
  await supabase
    .from("touchpoints")
    .update({ completed_at: isComplete ? new Date().toISOString() : null })
    .eq("id", touchpointId);

  revalidatePath(`/touchpoints/${touchpointId}`);
  revalidatePath("/touchpoints");
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteTouchpoint(touchpointId: string, clientId: string) {
  const supabase = await createClient();
  await supabase.from("touchpoints").delete().eq("id", touchpointId);
  revalidatePath("/touchpoints");
  revalidatePath(`/clients/${clientId}`);
  redirect("/touchpoints");
}
