"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { syncResumeFolder } from "@/lib/resume-sync";
import { screenPendingResumes, extractCandidateContactInfo } from "@/lib/resume-screening";
import { getActiveAiSettings } from "@/lib/ai/settings";
import type { ActiveAiSettings } from "@/lib/ai";
import type { MailConnection, ResumeStatus } from "@/lib/types";
import { getResendClient, buildInterviewInviteEmail } from "@/lib/resend";
import { buildInterviewIcs, interviewDateTimeToUtc } from "@/lib/ics";

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

  const { error } = await supabase.from("job_postings").insert({
    title,
    description,
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
 * already handle "no attachment" rows).
 *
 * Every field is optional except that SOMETHING has to be given. If a
 * resume was pasted and any of name/email/phone were left blank, tries to
 * fill just the missing ones in from the pasted text before saving — best
 * effort, via extractCandidateContactInfo (never blocks the save on
 * failure, just leaves those fields blank same as if nothing were pasted). */
export async function addCandidateAction(
  _prevState: AddCandidateState,
  formData: FormData
): Promise<AddCandidateState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that." };
  }

  let name = String(formData.get("candidate_name") ?? "").trim();
  let email = String(formData.get("candidate_email") ?? "").trim();
  let phone = String(formData.get("candidate_phone") ?? "").trim();
  const pastedText = String(formData.get("pasted_resume_text") ?? "").trim();

  if (!name && !email && !phone && !pastedText) {
    return { error: "Add at least a name, contact info, or a pasted resume." };
  }

  const admin = createAdminClient();

  if (pastedText && (!name || !email || !phone)) {
    const settings = await getActiveAiSettings(admin);
    if (settings) {
      const extracted = await extractCandidateContactInfo(pastedText, settings);
      name = name || extracted.candidate_name || "";
      email = email || extracted.candidate_email || "";
      phone = phone || extracted.candidate_phone || "";
    }
  }

  const { error } = await admin.from("resumes").insert({
    graph_message_id: `manual-${crypto.randomUUID()}`,
    graph_attachment_id: null,
    received_at: new Date().toISOString(),
    candidate_name: name || null,
    candidate_email: email || null,
    candidate_phone: phone || null,
    pasted_resume_text: pastedText || null,
  });
  if (error) {
    console.error("addCandidateAction failed", error);
    return { error: error.message };
  }

  revalidatePath("/recruitment");
  return { error: null };
}

export type ResumeScreenState = {
  ok: boolean;
  message: string;
  /** This call's own counts, plus the true DB-wide pending count afterward
   * — only set by screenPendingResumesAction (the "whatever's pending"
   * path). Lets the caller loop (see ScreenPendingResumesButton) and
   * accumulate a running total, instead of needing a single request to
   * process everything, which risks outliving the platform's own request
   * timeout when there are many pending resumes. */
  screened?: number;
  errored?: number;
  remaining?: number;
};

type JobPostingForScreening = {
  id: string;
  title: string;
  description: string;
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
    .select("id, title, description")
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
      screened: result.screened,
      errored: result.errored,
      remaining: result.remaining,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Screening failed." };
  }
}

/** Re-screens exactly the given rows against the current posting,
 * regardless of whether any of them were already screened before — useful
 * right after the posting's own instructions change, or after the
 * screening prompt itself changes, so a chosen set of candidates gets
 * judged against the current criteria rather than staying stuck with
 * whatever verdict they got last time. */
export async function screenSelectedResumesAction(resumeIds: string[]): Promise<ResumeScreenState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }
  if (resumeIds.length === 0) {
    return { ok: false, message: "Select at least one resume first." };
  }

  const admin = createAdminClient();
  const context = await loadScreeningContext(admin);
  if (!context.ok) return { ok: false, message: context.error };

  try {
    const result = await screenPendingResumes(admin, context.posting, context.settings, {
      resumeIds,
    });
    revalidatePath("/recruitment");
    return {
      ok: true,
      message: `Screened ${result.screened}, ${result.errored} error${result.errored === 1 ? "" : "s"}.`,
      screened: result.screened,
      errored: result.errored,
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

export type ScheduleInterviewState = { error: string | null; success: string | null };

/** Emails the candidate an interview invite with a standard .ics calendar
 * attachment (see src/lib/ics.ts) — not a real Microsoft Graph calendar
 * event, since that would need a new Calendars.ReadWrite permission and
 * re-consent on the app registration. Any calendar app can open the .ics
 * either way. Bumps status to "interviewing" on success, unless the
 * candidate's already past that (hired/rejected) — scheduling shouldn't
 * silently walk a closed-out candidate back into the pipeline. */
export async function scheduleInterviewAction(
  resumeId: string,
  _prevState: ScheduleInterviewState,
  formData: FormData
): Promise<ScheduleInterviewState> {
  const user = await requirePermission("manage_recruitment");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const durationMinutes = Number(formData.get("duration_minutes") ?? 30) || 30;
  const location = String(formData.get("location") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!date || !time) {
    return { error: "Pick a date and time.", success: null };
  }

  const admin = createAdminClient();
  const [{ data: resume }, { data: profile }, { data: posting }] = await Promise.all([
    admin
      .from("resumes")
      .select("candidate_name, candidate_email, sender_name, sender_email, status")
      .eq("id", resumeId)
      .maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    admin
      .from("job_postings")
      .select("id, title")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!resume) return { error: "Candidate not found.", success: null };

  const candidateEmail = resume.candidate_email ?? resume.sender_email;
  if (!candidateEmail) {
    return { error: "No email on file for this candidate.", success: null };
  }
  const candidateName = resume.candidate_name ?? resume.sender_name ?? "there";
  const recruiterName = profile?.full_name ?? user.email ?? "CG Technologies";
  const jobTitle = posting?.title ?? "the role";

  const start = interviewDateTimeToUtc(date, time);
  const whenLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(start);

  const fromAddress = process.env.REMINDERS_FROM_EMAIL ?? "CG Ops <reminders@example.com>";
  const organizerEmail = fromAddress.match(/<(.+)>/)?.[1] ?? fromAddress;

  const ics = buildInterviewIcs({
    uid: `interview-${resumeId}-${Date.now()}@cgtechnologies.com`,
    organizerEmail,
    organizerName: "CG Technologies",
    attendeeEmail: candidateEmail,
    attendeeName: candidateName,
    summary: `Interview: ${jobTitle}`,
    description: notes ?? `Interview for the ${jobTitle} role.`,
    location,
    start,
    durationMinutes,
  });

  const { html, text } = buildInterviewInviteEmail({
    candidateName,
    jobTitle,
    whenLabel,
    location,
    notes,
    recruiterName,
  });

  try {
    const resend = getResendClient();
    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: candidateEmail,
      replyTo: user.email ?? undefined,
      subject: `Interview invite: ${jobTitle}`,
      html,
      text,
      // Explicitly base64-encoded rather than passing the raw Buffer — the
      // SDK's own Buffer handling isn't something this codebase can verify
      // without a live send, and an already-base64 string is unambiguously
      // what Resend's HTTP API itself expects for attachment content.
      attachments: [
        {
          filename: "interview.ics",
          content: Buffer.from(ics, "utf-8").toString("base64"),
          contentType: "text/calendar; charset=utf-8; method=REQUEST",
        },
      ],
    });
    if (sendError) {
      console.error("scheduleInterviewAction: Resend rejected the email", sendError);
      return { error: "Couldn't send the invite — check Resend settings.", success: null };
    }
  } catch (err) {
    console.error("scheduleInterviewAction: email send failed", err);
    return {
      error: err instanceof Error ? err.message : "Couldn't send the invite.",
      success: null,
    };
  }

  if (resume.status !== "hired" && resume.status !== "rejected") {
    await admin.from("resumes").update({ status: "interviewing" }).eq("id", resumeId);
  }

  // Durable record of the invite — previously the scheduled date/time only
  // ever existed in the sent email itself, with nothing kept in the app.
  // Re-scheduling the same candidate inserts another row rather than
  // overwriting, so past invites stay visible too.
  await admin.from("resume_interviews").insert({
    resume_id: resumeId,
    job_posting_id: posting?.id ?? null,
    scheduled_at: start.toISOString(),
    duration_minutes: durationMinutes,
    location,
    notes,
    scheduled_by: user.id,
  });

  revalidatePath("/recruitment");

  return { error: null, success: `Invite sent to ${candidateEmail}.` };
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
