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
    type: String(formData.get("type") ?? "monthly_visit") as TouchpointType,
    due_date: String(formData.get("due_date") ?? ""),
    notes: emptyToNull(formData.get("notes")),
    next_action: emptyToNull(formData.get("next_action")),
    owner_id: emptyToNull(formData.get("owner_id")),
  };
}

/**
 * Keeps a touchpoint's "next action" in sync with a single linked task, so
 * editing or clearing the field updates the same task rather than piling up
 * duplicates. Only ever touches the one task tied to this touchpoint.
 */
async function syncTouchpointActionTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  touchpointId: string,
  clientId: string,
  nextAction: string | null,
  ownerId: string | null,
  dueDate: string,
  createdBy: string | null
) {
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("source_touchpoint_id", touchpointId)
    .maybeSingle();

  if (!nextAction) {
    if (existing) await supabase.from("tasks").delete().eq("id", existing.id);
    return;
  }

  if (existing) {
    await supabase
      .from("tasks")
      .update({ title: nextAction, assigned_to: ownerId, due_date: dueDate })
      .eq("id", existing.id);
  } else {
    await supabase.from("tasks").insert({
      client_id: clientId,
      kind: "touchpoint_action",
      title: nextAction,
      assigned_to: ownerId,
      due_date: dueDate,
      source_touchpoint_id: touchpointId,
      created_by: createdBy,
    });
  }
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
    .insert({ ...fields, owner_id: fields.owner_id ?? user?.id ?? null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await syncTouchpointActionTask(
    supabase,
    data.id,
    fields.client_id,
    fields.next_action,
    fields.owner_id ?? user?.id ?? null,
    fields.due_date,
    user?.id ?? null
  );

  revalidatePath("/touchpoints");
  revalidatePath("/tasks");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fields = parseTouchpointFields(formData);
  if (!fields.due_date) return { error: "Due date is required." };

  const { error } = await supabase
    .from("touchpoints")
    .update(fields)
    .eq("id", touchpointId);

  if (error) return { error: error.message };

  await syncTouchpointActionTask(
    supabase,
    touchpointId,
    clientId,
    fields.next_action,
    fields.owner_id,
    fields.due_date,
    user?.id ?? null
  );

  revalidatePath(`/touchpoints/${touchpointId}`);
  revalidatePath("/touchpoints");
  revalidatePath("/tasks");
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
