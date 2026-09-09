"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { syncResumeFolder } from "@/lib/resume-sync";
import { screenPendingResumes } from "@/lib/resume-screening";
import { getActiveAiSettings } from "@/lib/ai/settings";
import type { MailConnection, ResumeStatus } from "@/lib/types";

/** Updates the signed-in user's own watched folder name. One row per staff
 * user on mail_connections, same as every other per-user mailbox setting
 * this app already has (review_excludes, sync_excluded_senders, ...). */
export async function updateResumeFolderName(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const folderName = String(formData.get("folder_name") ?? "").trim();

  const { error } = await supabase
    .from("mail_connections")
    .update({ resume_folder_name: folderName || null })
    .eq("user_id", user.id);
  if (error) {
    console.error("updateResumeFolderName failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}

export type ResumeSyncState = { ok: boolean; message: string };

/** Mirrors settings/mail's syncNow shape exactly — loads the caller's own
 * mail_connections row, calls the sync function, surfaces failures
 * (including an AADSTS53003-style token-refresh error) the same way that
 * existing action already does. Gated on manage_recruitment, unlike
 * syncNow: this is specifically the recruitment feature, not a general
 * personal-mailbox utility. */
export async function syncResumesNow(): Promise<ResumeSyncState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) {
    return { ok: false, message: "Connect your mailbox under Settings → Mailbox first." };
  }

  try {
    const result = await syncResumeFolder(admin, connection as MailConnection);
    revalidatePath("/recruitment");
    return {
      ok: true,
      message: `Scanned ${result.scanned} message${result.scanned === 1 ? "" : "s"}, imported ${result.imported} new resume${result.imported === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Sync failed." };
  }
}

export type CreateJobPostingState = { error: string | null };

/** Always inserts a new row — this IS the "edit" operation. job_postings is
 * append-only by design (see the plan): there's no "active" flag, the
 * current posting is just the newest row, so past resumes keep pointing at
 * whatever posting they were actually screened against even after this one
 * changes. */
export async function createJobPosting(
  _prevState: CreateJobPostingState,
  formData: FormData
): Promise<CreateJobPostingState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title || !description) {
    return { error: "Title and description are both required." };
  }

  const { error } = await supabase
    .from("job_postings")
    .insert({ title, description, created_by: user.id });
  if (error) {
    console.error("createJobPosting failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}

export type ResumeScreenState = { ok: boolean; message: string };

/** Loads the current posting (newest row) and the active AI provider, then
 * screens every resume still awaiting one. Anthropic-only — screenPendingResumes
 * itself refuses and returns a clear error if OpenAI is active, rather than
 * attempting anything partial. */
export async function screenPendingResumesAction(): Promise<ResumeScreenState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();

  const { data: posting } = await admin
    .from("job_postings")
    .select("id, title, description")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!posting) {
    return { ok: false, message: "Add a job posting first." };
  }

  const settings = await getActiveAiSettings(admin);
  if (!settings) {
    return { ok: false, message: "No AI provider is set up — configure one under Settings → Integrations." };
  }

  try {
    const result = await screenPendingResumes(admin, posting, settings);
    revalidatePath("/recruitment");
    return {
      ok: true,
      message: `Screened ${result.screened}, ${result.errored} error${result.errored === 1 ? "" : "s"}, ${result.remaining} remaining.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Screening failed." };
  }
}

/** Exact shape of updateSuggestionStatus — a human overriding/marking a
 * durable, redisplayed result, mutated in place rather than a separate
 * dismissal table (see the plan's reasoning). */
export async function updateResumeStatusAction(id: string, status: ResumeStatus): Promise<void> {
  if (!(await requirePermission("manage_recruitment"))) return;

  const admin = createAdminClient();
  await admin.from("resumes").update({ status }).eq("id", id);
  revalidatePath("/recruitment");
}
