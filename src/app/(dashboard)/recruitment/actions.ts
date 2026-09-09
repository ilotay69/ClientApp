"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { syncResumeFolder } from "@/lib/resume-sync";
import { screenPendingResumes } from "@/lib/resume-screening";
import { getActiveAiSettings } from "@/lib/ai/settings";
import type { ActiveAiSettings } from "@/lib/ai";
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
  const additionalInstructions = String(formData.get("additional_instructions") ?? "").trim();
  if (!title || !description) {
    return { error: "Title and description are both required." };
  }

  const { error } = await supabase.from("job_postings").insert({
    title,
    description,
    additional_instructions: additionalInstructions || null,
    created_by: user.id,
  });
  if (error) {
    console.error("createJobPosting failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}

export type AddCandidateState = { error: string | null };

/** Manually adds an applicant with no email behind it at all — someone
 * referred in person, met at an event, etc. Reuses the resumes table rather
 * than a parallel one: graph_message_id is NOT NULL with no default (every
 * other row is keyed off a real Graph message), so a manual row gets a
 * synthetic, guaranteed-unique placeholder instead of a schema change.
 * graph_attachment_id stays null, same as a notification-only synced row —
 * from here on it behaves identically (upload/paste/screen/delete all
 * already handle "no attachment" rows). */
export async function addCandidateAction(
  _prevState: AddCandidateState,
  formData: FormData
): Promise<AddCandidateState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that." };
  }

  const name = String(formData.get("candidate_name") ?? "").trim();
  const email = String(formData.get("candidate_email") ?? "").trim();
  const phone = String(formData.get("candidate_phone") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("resumes").insert({
    graph_message_id: `manual-${crypto.randomUUID()}`,
    graph_attachment_id: null,
    received_at: new Date().toISOString(),
    candidate_name: name,
    candidate_email: email || null,
    candidate_phone: phone || null,
  });
  if (error) {
    console.error("addCandidateAction failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}

export type ResumeScreenState = { ok: boolean; message: string };

type JobPostingForScreening = {
  id: string;
  title: string;
  description: string;
  additional_instructions: string | null;
};

// An explicit discriminated union (a literal `ok` field), not three bare
// object shapes narrowed via `"error" in context` — that inferred version
// built fine locally but failed the real (Railway) TypeScript check with
// "string | undefined is not assignable to string", since the three
// branches don't share a clean discriminant for the compiler to narrow on.
// `ok` removes the ambiguity outright.
type ScreeningContext =
  | { ok: true; posting: JobPostingForScreening; settings: ActiveAiSettings }
  | { ok: false; error: string };

/** Shared by both screening actions below — loads the current posting
 * (newest row) and the active AI provider, or a clear reason why it can't
 * proceed. */
async function loadScreeningContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<ScreeningContext> {
  const { data: posting } = await admin
    .from("job_postings")
    .select("id, title, description, additional_instructions")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!posting) return { ok: false, error: "Add a job posting first." };

  const settings = await getActiveAiSettings(admin);
  if (!settings) {
    return {
      ok: false,
      error: "No AI provider is set up — configure one under Settings → Integrations.",
    };
  }

  return { ok: true, posting, settings };
}

/** Screens every resume still awaiting one (screened_at = null). Anthropic-only
 * — screenPendingResumes itself refuses and returns a clear error if OpenAI is
 * active, rather than attempting anything partial. */
export async function screenPendingResumesAction(): Promise<ResumeScreenState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const context = await loadScreeningContext(admin);
  if (!context.ok) return { ok: false, message: context.error };

  try {
    const result = await screenPendingResumes(admin, context.posting, context.settings);
    revalidatePath("/recruitment");
    return {
      ok: true,
      message: `Screened ${result.screened}, ${result.errored} error${result.errored === 1 ? "" : "s"}, ${result.remaining} remaining.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Screening failed." };
  }
}

/** Re-screens EVERY resume against the current posting, regardless of
 * whether it's already been screened before — useful right after the
 * posting's own instructions change, or after the screening prompt itself
 * changes, so existing rows get judged against the current criteria rather
 * than staying stuck with whatever verdict they got last time. */
export async function screenAllResumesAction(): Promise<ResumeScreenState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const context = await loadScreeningContext(admin);
  if (!context.ok) return { ok: false, message: context.error };

  try {
    const result = await screenPendingResumes(admin, context.posting, context.settings, {
      rescreenAll: true,
    });
    revalidatePath("/recruitment");
    return {
      ok: true,
      message: `Re-screened ${result.screened}, ${result.errored} error${result.errored === 1 ? "" : "s"}, ${result.remaining} remaining.`,
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

/** Permanently removes an applicant row — e.g. a job-board notification
 * that's clearly spam, a duplicate, or someone no longer worth tracking.
 * Deletes the row first, then best-effort cleans up its storage object:
 * an orphaned file left behind on a rare cleanup failure is harmless, while
 * a row left pointing at an already-deleted file is a visible broken link. */
export async function deleteResumeAction(id: string): Promise<void> {
  if (!(await requirePermission("manage_recruitment"))) return;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("resumes")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  await admin.from("resumes").delete().eq("id", id);

  if (existing?.storage_path) {
    await admin.storage.from("resumes").remove([existing.storage_path]);
  }

  revalidatePath("/recruitment");
}

const MAX_RESUME_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB, same cap as client documents
const RESUME_MEDIA_TYPES: Record<string, true> = {
  "application/pdf": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
};

export type ResumeContentState = { error: string | null };

/** For an applicant row sync created with no attachment (a job-board
 * notification with no resume file) — or to replace one that's wrong.
 * Doesn't re-screen automatically: clears screened_at back to null so the
 * NEXT "Screen pending resumes" click (already-existing button, not a new
 * one) naturally picks this row up along with anything else pending,
 * rather than adding a second, parallel single-row screening code path. */
export async function uploadResumeFileAction(
  resumeId: string,
  _prevState: ResumeContentState,
  formData: FormData
): Promise<ResumeContentState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  // Same mislabeled-MIME-type fallback as uploadInteractionDocument — some
  // browsers/OSes report a real .docx as application/octet-stream.
  const extensionOk = /\.(pdf|docx)$/i.test(file.name);
  if (!RESUME_MEDIA_TYPES[file.type] && !extensionOk) {
    return { error: "Only PDF or Word (.docx) resumes are supported." };
  }
  if (file.size > MAX_RESUME_UPLOAD_BYTES) return { error: "That file is larger than 20MB." };

  const contentType = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${resumeId}/${crypto.randomUUID()}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("resumes")
    .upload(path, bytes, { contentType });
  if (uploadError) {
    console.error("uploadResumeFileAction: upload failed", uploadError);
    return { error: uploadError.message };
  }

  const { error } = await admin
    .from("resumes")
    .update({
      storage_path: path,
      file_name: file.name,
      file_size_bytes: file.size,
      content_type: contentType,
      pasted_resume_text: null, // a file replaces pasted text, not both at once
      screened_at: null,
      screening_error: null,
    })
    .eq("id", resumeId);
  if (error) {
    await admin.storage.from("resumes").remove([path]); // matches uploadInteractionDocument's rollback
    console.error("uploadResumeFileAction: row update failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}

/** Alternative to uploading a file — staff copy/pastes resume text directly
 * (e.g. from a job board's own resume-viewer page that this app can't fetch
 * server-side, see the plan discussion on why). Clears any existing file,
 * same "one or the other" rule as uploadResumeFileAction going the other
 * direction. Also doesn't re-screen automatically, same reasoning. */
export async function pasteResumeTextAction(
  resumeId: string,
  _prevState: ResumeContentState,
  formData: FormData
): Promise<ResumeContentState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that." };
  }

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Paste the resume text first." };

  const admin = createAdminClient();

  // If this row previously had an uploaded file, remove the orphaned
  // storage object rather than leaving it unreferenced.
  const { data: existing } = await admin
    .from("resumes")
    .select("storage_path")
    .eq("id", resumeId)
    .maybeSingle();
  if (existing?.storage_path) {
    await admin.storage.from("resumes").remove([existing.storage_path]);
  }

  const { error } = await admin
    .from("resumes")
    .update({
      pasted_resume_text: text,
      storage_path: null,
      file_name: null,
      file_size_bytes: null,
      content_type: null,
      screened_at: null,
      screening_error: null,
    })
    .eq("id", resumeId);
  if (error) {
    console.error("pasteResumeTextAction failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}
