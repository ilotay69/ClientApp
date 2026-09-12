"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { syncResumeFolder } from "@/lib/resume-sync";
import { screenPendingResumes, extractCandidateContactInfo } from "@/lib/resume-screening";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { generateInterviewAnalysis } from "@/lib/interview-analysis";
import type { ActiveAiSettings } from "@/lib/ai";
import type { MailConnection, ResumeStatus, ResumeVerdict } from "@/lib/types";
import { interviewDateTimeToUtc } from "@/lib/ics";
import { sendMailAsSharedMailbox, createSharedMailboxEvent } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";

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

/** Staff's own Yes/Maybe/No call — kept on a separate column from
 * ai_verdict, so a human override is never confused with (or overwritten
 * by) the AI screener's own judgment. */
export async function updateResumeHumanVerdictAction(
  id: string,
  verdict: ResumeVerdict | null
): Promise<void> {
  if (!(await requirePermission("manage_recruitment"))) return;

  const admin = createAdminClient();
  await admin.from("resumes").update({ human_verdict: verdict }).eq("id", id);
  revalidatePath("/recruitment");
}

/** One free-text field, not a list like interview notes — staff's own final
 * call once the interview process has run its course. Deliberately no fixed
 * set of values (unlike status/verdict) since this is meant to read as a
 * short paragraph, not a category. */
export async function updateFinalDecisionAction(id: string, decision: string | null): Promise<void> {
  if (!(await requirePermission("manage_recruitment"))) return;

  const admin = createAdminClient();
  await admin.from("resumes").update({ final_decision: decision }).eq("id", id);
  revalidatePath("/recruitment");
}

export type AddInterviewNoteState = { error: string | null; success: string | null };

/** Saves one interview note, then best-effort regenerates the rolling AI
 * analysis from ALL of that candidate's notes together — a failed or
 * unconfigured AI provider must never block saving the note itself, so the
 * regeneration step is wrapped separately and only ever logged on failure. */
export async function addInterviewNoteAction(
  resumeId: string,
  _prevState: AddInterviewNoteState,
  formData: FormData
): Promise<AddInterviewNoteState> {
  const user = await requirePermission("manage_recruitment");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const noteText = String(formData.get("note") ?? "").trim();
  if (!noteText) {
    return { error: "Write a note first.", success: null };
  }

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("resume_interview_notes").insert({
    resume_id: resumeId,
    note_text: noteText,
    created_by: user.id,
  });
  if (insertError) {
    console.error("addInterviewNoteAction: insert failed", insertError);
    return { error: "Couldn't save the note.", success: null };
  }

  try {
    await regenerateInterviewAnalysis(admin, resumeId);
  } catch (err) {
    console.error("addInterviewNoteAction: analysis regeneration failed", err);
  }

  revalidatePath("/recruitment");
  return { error: null, success: "Note added." };
}

async function regenerateInterviewAnalysis(admin: ReturnType<typeof createAdminClient>, resumeId: string) {
  const settings = await getActiveAiSettings(admin);
  if (!settings) return;

  const { data: resume } = await admin
    .from("resumes")
    .select("candidate_name, sender_name, job_posting_id")
    .eq("id", resumeId)
    .maybeSingle();
  if (!resume) return;

  let jobTitle: string | null = null;
  if (resume.job_posting_id) {
    const { data: posting } = await admin
      .from("job_postings")
      .select("title")
      .eq("id", resume.job_posting_id)
      .maybeSingle();
    jobTitle = posting?.title ?? null;
  }

  const { data: notes } = await admin
    .from("resume_interview_notes")
    .select("note_text, created_at, profiles(full_name)")
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: true });

  const notesForAnalysis = (notes ?? []).map(
    (n: { note_text: string; created_at: string; profiles: { full_name: string } | { full_name: string }[] | null }) => {
      const profile = Array.isArray(n.profiles) ? n.profiles[0] : n.profiles;
      return {
        noteText: n.note_text,
        createdAt: n.created_at,
        authorName: profile?.full_name ?? null,
      };
    }
  );

  const candidateName = resume.candidate_name ?? resume.sender_name ?? "the candidate";
  const analysis = await generateInterviewAnalysis(candidateName, jobTitle, notesForAnalysis, settings);
  if (!analysis) return;

  await admin
    .from("resumes")
    .update({ ai_interview_analysis: analysis, ai_interview_analysis_at: new Date().toISOString() })
    .eq("id", resumeId);
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
  // Falls back to the generic company name, never to user.email — nothing
  // in this candidate-facing email should be able to leak a staff member's
  // own address even indirectly.
  const recruiterName = profile?.full_name ?? "CG Technologies";
  const jobTitle = posting?.title ?? "the role";

  const start = interviewDateTimeToUtc(date, time);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  // The shared mailbox, not any individual staff member's own email —
  // nothing here should expose a personal company address to the
  // candidate. The event lives on this mailbox's own calendar; Exchange
  // sends the actual meeting-request email to the candidate automatically
  // as a side effect of creating it below, no separate email step needed.
  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) {
    return {
      error: "The shared mailbox isn't configured yet — set SHARED_MAILBOX_EMAIL.",
      success: null,
    };
  }

  // Just the descriptive content — Graph appends its own "Join Microsoft
  // Teams Meeting" block to this automatically (isOnlineMeeting below), and
  // Outlook's own invite chrome (time, location, Accept/Decline buttons)
  // wraps around it, so this doesn't need to rebuild any of that itself.
  const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
    <p>Interview for the <strong>${jobTitle}</strong> role, with ${recruiterName} · CG Technologies.</p>
    ${notes ? `<p style="white-space:pre-line;">${notes.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : ""}
  </div>`;

  let eventResult: { id: string; teamsJoinUrl: string | null };
  try {
    const settings = await getSharedMailboxSettings(admin);
    if (!settings) {
      return { error: "The shared mailbox integration hasn't been set up yet.", success: null };
    }
    const accessToken = await getValidSharedMailboxToken(admin, settings);
    eventResult = await createSharedMailboxEvent(accessToken, mailboxEmail, {
      subject: `Interview: ${jobTitle}`,
      bodyHtml,
      start,
      end,
      location,
      attendeeEmail: candidateEmail,
      attendeeName: candidateName,
    });
  } catch (err) {
    console.error("scheduleInterviewAction: event creation failed", err);
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
    graph_event_id: eventResult.id,
    teams_join_url: eventResult.teamsJoinUrl,
  });

  revalidatePath("/recruitment");

  return {
    error: null,
    success: `Invite sent to ${candidateEmail}.${eventResult.teamsJoinUrl ? " Teams link generated." : ""}`,
  };
}

export type SendCandidateReplyState = { error: string | null; success: string | null };

/** Staff-side half of the candidate messaging thread — sends through the
 * same shared mailbox as scheduleInterviewAction, and logs an outbound
 * resume_messages row so it shows up in the thread alongside whatever the
 * candidate-messages-sync cron files as inbound. */
export async function sendCandidateReplyAction(
  resumeId: string,
  _prevState: SendCandidateReplyState,
  formData: FormData
): Promise<SendCandidateReplyState> {
  const user = await requirePermission("manage_recruitment");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return { error: "Write a message first.", success: null };
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) {
    return {
      error: "The shared mailbox isn't configured yet — set SHARED_MAILBOX_EMAIL.",
      success: null,
    };
  }

  const admin = createAdminClient();
  const { data: resume } = await admin
    .from("resumes")
    .select("candidate_name, candidate_email, sender_name, sender_email")
    .eq("id", resumeId)
    .maybeSingle();
  if (!resume) return { error: "Candidate not found.", success: null };

  const candidateEmail = resume.candidate_email ?? resume.sender_email;
  if (!candidateEmail) {
    return { error: "No email on file for this candidate.", success: null };
  }
  const candidateName = resume.candidate_name ?? resume.sender_name ?? "there";
  const firstName = candidateName.split(" ")[0] || candidateName;

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
    <p>Hi ${firstName},</p>
    <p style="white-space:pre-line;">${body.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    <p style="margin-top:24px;color:#64748b;font-size:13px;">CG Technologies</p>
  </div>`;
  const text = `Hi ${firstName},\n\n${body}\n\nCG Technologies`;

  try {
    const settings = await getSharedMailboxSettings(admin);
    if (!settings) {
      return { error: "The shared mailbox integration hasn't been set up yet.", success: null };
    }
    const accessToken = await getValidSharedMailboxToken(admin, settings);
    await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
      to: candidateEmail,
      subject: "Message from CG Technologies",
      html,
      text,
    });
  } catch (err) {
    console.error("sendCandidateReplyAction: send failed", err);
    return { error: err instanceof Error ? err.message : "Couldn't send the message.", success: null };
  }

  await admin.from("resume_messages").insert({
    resume_id: resumeId,
    direction: "outbound",
    subject: "Message from CG Technologies",
    body_text: body,
    sent_at: new Date().toISOString(),
    from_email: mailboxEmail,
    to_email: candidateEmail,
    sent_by: user.id,
  });

  revalidatePath("/recruitment");
  return { error: null, success: `Sent to ${candidateEmail}.` };
}

export type BulkMessageState = { ok: boolean; message: string; sent?: number; errored?: number };

/** Sends the same message (with an optional booking-link call-to-action) to
 * every selected candidate — e.g. "here's a link, pick your own interview
 * slot" instead of staff scheduling each one individually. One
 * resume_messages row per recipient, same as the single-candidate reply
 * form, so every send still shows up in that candidate's own thread. Chunked
 * client-side (see BulkMessageForm) for the same reason screening selected
 * resumes is chunked — a large selection risks outliving the platform's
 * request timeout in one call. */
export async function sendBulkCandidateMessageAction(
  resumeIds: string[],
  body: string,
  link: string | null,
  linkLabel: string | null
): Promise<BulkMessageState> {
  const user = await requirePermission("manage_recruitment");
  if (!user) {
    return { ok: false, message: "You don't have permission to do that." };
  }
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return { ok: false, message: "Write a message first." };
  }
  if (resumeIds.length === 0) {
    return { ok: false, message: "Select at least one candidate first." };
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) {
    return { ok: false, message: "The shared mailbox isn't configured yet — set SHARED_MAILBOX_EMAIL." };
  }

  const admin = createAdminClient();
  const settings = await getSharedMailboxSettings(admin);
  if (!settings) {
    return { ok: false, message: "The shared mailbox integration hasn't been set up yet." };
  }

  const trimmedLink = link?.trim() || null;
  const trimmedLinkLabel = linkLabel?.trim() || "Book your interview time";

  let sent = 0;
  let errored = 0;
  for (const resumeId of resumeIds) {
    try {
      const { data: resume } = await admin
        .from("resumes")
        .select("candidate_name, candidate_email, sender_name, sender_email")
        .eq("id", resumeId)
        .maybeSingle();
      const candidateEmail = resume?.candidate_email ?? resume?.sender_email;
      if (!candidateEmail) {
        errored += 1;
        continue;
      }
      const candidateName = resume?.candidate_name ?? resume?.sender_name ?? "there";
      const firstName = candidateName.split(" ")[0] || candidateName;

      const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;">
        <p>Hi ${firstName},</p>
        <p style="white-space:pre-line;">${trimmedBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        ${
          trimmedLink
            ? `<p style="margin:20px 0;"><a href="${trimmedLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">${trimmedLinkLabel}</a></p>`
            : ""
        }
        <p style="margin-top:24px;color:#64748b;font-size:13px;">CG Technologies</p>
      </div>`;
      const text = `Hi ${firstName},\n\n${trimmedBody}${
        trimmedLink ? `\n\n${trimmedLinkLabel}: ${trimmedLink}` : ""
      }\n\nCG Technologies`;

      const accessToken = await getValidSharedMailboxToken(admin, settings);
      await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
        to: candidateEmail,
        subject: "Message from CG Technologies",
        html,
        text,
      });

      await admin.from("resume_messages").insert({
        resume_id: resumeId,
        direction: "outbound",
        subject: "Message from CG Technologies",
        body_text: trimmedLink ? `${trimmedBody}\n\n${trimmedLinkLabel}: ${trimmedLink}` : trimmedBody,
        sent_at: new Date().toISOString(),
        from_email: mailboxEmail,
        to_email: candidateEmail,
        sent_by: user.id,
      });
      sent += 1;
    } catch (err) {
      console.error("sendBulkCandidateMessageAction: send failed", err);
      errored += 1;
    }
  }

  revalidatePath("/recruitment");
  return {
    ok: true,
    message: `Sent ${sent}${errored > 0 ? `, ${errored} error${errored === 1 ? "" : "s"}` : ""}.`,
    sent,
    errored,
  };
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

export type BulkUploadResumesState = {
  error: string | null;
  success: string | null;
  /** This call's own counts — set so the caller (BulkUploadResumesForm,
   * which chunks a large selection into several calls the same way
   * ScreenPendingResumesButton does) can accumulate a running total across
   * chunks instead of only ever seeing one chunk's own message. */
  created?: number;
  failures?: string[];
};

/** One or more resume files at once, each becoming its own brand-new
 * candidate row — the bulk counterpart to addCandidateAction's manual
 * single-candidate form, except with an actual file per candidate instead
 * of pasted text. Not screened automatically, same as every other
 * upload/paste path — "Screen pending resumes" (or selecting these rows
 * and "Screen selected") picks them up afterward, which is also what
 * extracts candidate_name/email/phone for each one. A per-file failure
 * (wrong type, storage error) doesn't abort the rest of the batch. */
export async function bulkUploadResumesAction(
  _prevState: BulkUploadResumesState,
  formData: FormData
): Promise<BulkUploadResumesState> {
  if (!(await requirePermission("manage_recruitment"))) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { error: "Choose one or more resume files.", success: null };
  }

  const admin = createAdminClient();
  let created = 0;
  const failures: string[] = [];

  for (const file of files) {
    // Wraps this one file's entire path — a thrown exception here (a
    // corrupted file failing arrayBuffer(), a Storage SDK call that
    // throws instead of returning {error} on some malformed input, etc.)
    // used to propagate straight out of the whole Server Action call with
    // no graceful {error} response at all, which is what actually caused
    // the generic, uninformative "page couldn't load" failure a bad file
    // triggered — one file's real problem should never take down the
    // whole request when every other file in the batch is fine.
    try {
      const extensionOk = /\.(pdf|docx)$/i.test(file.name);
      if (!RESUME_MEDIA_TYPES[file.type] && !extensionOk) {
        failures.push(`${file.name} — not a PDF or Word file, paste its text instead`);
        continue;
      }
      if (file.size > MAX_RESUME_UPLOAD_BYTES) {
        failures.push(`${file.name} — larger than 20MB, paste its text instead`);
        continue;
      }

      const contentType =
        file.type === "application/pdf" || /\.pdf$/i.test(file.name)
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      // Generated up front (rather than left to the resumes table's own
      // default) so the storage path can nest under this row's id, same
      // layout convention as uploadResumeFileAction's single-file path.
      const resumeId = crypto.randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${resumeId}/${crypto.randomUUID()}-${safeName}`;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage.from("resumes").upload(path, bytes, { contentType });
      if (uploadError) {
        console.error("bulkUploadResumesAction: upload failed", uploadError);
        failures.push(`${file.name} — couldn't be uploaded, paste its text instead`);
        continue;
      }

      const { error: insertError } = await admin.from("resumes").insert({
        id: resumeId,
        graph_message_id: `manual-${crypto.randomUUID()}`,
        graph_attachment_id: null,
        received_at: new Date().toISOString(),
        storage_path: path,
        file_name: file.name,
        file_size_bytes: file.size,
        content_type: contentType,
      });
      if (insertError) {
        await admin.storage.from("resumes").remove([path]); // matches uploadResumeFileAction's rollback
        console.error("bulkUploadResumesAction: row insert failed", insertError);
        failures.push(`${file.name} — couldn't be saved, paste its text instead`);
        continue;
      }

      created += 1;
    } catch (err) {
      console.error("bulkUploadResumesAction: unexpected error on one file", file.name, err);
      failures.push(`${file.name} — couldn't be uploaded, paste its text instead`);
    }
  }

  revalidatePath("/recruitment");

  if (created === 0) {
    return { error: `Nothing was added — ${failures.join(", ")}.`, success: null, created, failures };
  }
  const summary = `Added ${created} candidate${created === 1 ? "" : "s"}.`;
  return {
    error: null,
    success: failures.length > 0 ? `${summary} ${failures.length} failed: ${failures.join(", ")}` : summary,
    created,
    failures,
  };
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

/** Hides one message from the top-of-page "Candidate messages" rollup only
 * — the message row itself, and its place in that candidate's own thread
 * under their row, are untouched. Nothing keys off dismissed_at anywhere
 * else, so this can't accidentally affect anything under the candidate. */
export async function dismissMessageAction(messageId: string): Promise<void> {
  if (!(await requirePermission("manage_recruitment"))) return;

  const admin = createAdminClient();
  await admin.from("resume_messages").update({ dismissed_at: new Date().toISOString() }).eq("id", messageId);
  revalidatePath("/recruitment");
}
