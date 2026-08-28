"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskKind, TaskStatus } from "@/lib/types";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createTask(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const { error } = await supabase.from("tasks").insert({
    title,
    kind: String(formData.get("kind") ?? "general") as TaskKind,
    client_id: emptyToNull(formData.get("client_id")),
    assigned_to: emptyToNull(formData.get("assigned_to")),
    due_date: emptyToNull(formData.get("due_date")),
    detail: emptyToNull(formData.get("detail")),
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function assignTask(taskId: string, assignedTo: string | null) {
  const supabase = await createClient();
  await supabase.from("tasks").update({ assigned_to: assignedTo }).eq("id", taskId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", taskId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
