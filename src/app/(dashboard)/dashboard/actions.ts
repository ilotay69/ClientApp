"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { generateSuggestions } from "@/lib/suggestions";
import type { SuggestionStatus } from "@/lib/types";

export type RefreshState = { error: string | null; summary: string | null };

export async function refreshInsights(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: RefreshState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _formData: FormData
): Promise<RefreshState> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "AI insights aren't set up yet (no Anthropic API key configured).", summary: null };
  }

  const admin = createAdminClient();
  try {
    const result = await generateSuggestions(admin, { maxClients: 10 });
    revalidatePath("/dashboard");
    return {
      error: null,
      summary: `Checked ${result.clientsConsidered} client${result.clientsConsidered === 1 ? "" : "s"} with recent email activity, found ${result.created} new insight${result.created === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Refresh failed.", summary: null };
  }
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus) {
  const admin = createAdminClient();
  await admin.from("suggestions").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}

/** Turns an AI suggestion into an assigned, trackable task, and marks the
 * suggestion itself done so it drops off the Insights feed. */
export async function promoteSuggestionToTask(
  suggestionId: string,
  clientId: string,
  kind: string,
  summary: string,
  detail: string | null,
  assignedTo: string
) {
  if (!assignedTo) return;
  const admin = createAdminClient();

  const taskKind = ["quote_follow_up", "urgent_alert", "new_project"].includes(kind)
    ? kind
    : "email_follow_up";

  const { data: task, error } = await admin
    .from("tasks")
    .insert({
      client_id: clientId,
      kind: taskKind,
      title: summary,
      detail,
      assigned_to: assignedTo,
      source_suggestion_id: suggestionId,
    })
    .select("id")
    .single();

  if (error || !task) return;

  await admin.from("task_assignees").insert({ task_id: task.id, profile_id: assignedTo });

  await admin
    .from("suggestions")
    .update({ status: "done", task_id: task.id })
    .eq("id", suggestionId);

  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}
