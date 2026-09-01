"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateSuggestions } from "@/lib/suggestions";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { reviewMailbox, type MailboxReviewResult } from "@/lib/mailbox-review";
import type { SuggestionStatus, MailConnection } from "@/lib/types";

export type RefreshState = { error: string | null; summary: string | null };

export async function refreshInsights(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: RefreshState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _formData: FormData
): Promise<RefreshState> {
  const admin = createAdminClient();

  if (!(await getActiveAiSettings(admin))) {
    return {
      error: "AI insights aren't set up yet — configure a provider and API key on the AI Settings page.",
      summary: null,
    };
  }

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

export type MailboxReviewState = { error: string | null; result: MailboxReviewResult | null };

/** Live read of the signed-in user's own connected mailbox — nothing here
 * is persisted (no email content is written to any table); the result is
 * only ever returned to the button that triggered it. */
export async function reviewMyMailbox(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: MailboxReviewState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _formData: FormData
): Promise<MailboxReviewState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", result: null };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return {
      error: "Connect your mailbox first on the Mailbox settings page.",
      result: null,
    };
  }

  try {
    const result = await reviewMailbox(admin, connection as MailConnection);
    return { error: null, result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Mailbox review failed.", result: null };
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
