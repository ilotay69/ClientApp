import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { AsyncActionButton } from "@/components/sync-resumes-button";
import { ResumeFolderSettingsForm } from "@/components/resume-folder-settings-form";
import { JobPostingForm } from "@/components/job-posting-form";
import { ResumeFilterBar } from "@/components/resume-filter-bar";
import { RecruitmentTable, type RecruitmentTableRow } from "@/components/recruitment-table";
import { AddCandidateForm } from "@/components/add-candidate-form";
import { BulkUploadResumesForm } from "@/components/bulk-upload-resumes-form";
import { Badge } from "@/components/badge";
import {
  updateResumeFolderName,
  syncResumesNow,
  createJobPosting,
  screenPendingResumesAction,
  screenSelectedResumesAction,
  updateResumeStatusAction,
  updateResumeHumanVerdictAction,
  updateFinalDecisionAction,
  addInterviewNoteAction,
  uploadResumeFileAction,
  pasteResumeTextAction,
  deleteResumeAction,
  addCandidateAction,
  bulkUploadResumesAction,
  scheduleInterviewAction,
  sendCandidateReplyAction,
  sendBulkCandidateMessageAction,
} from "./actions";

export const dynamic = "force-dynamic";

function toParamArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    our_verdict?: string | string[];
    big_firm?: string;
    min_years?: string | string[];
    working?: string;
    m365?: string;
    gta?: string;
    stability?: string;
    canada?: string;
    no_resume?: string;
    q?: string;
    show_past_interviews?: string;
  }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_recruitment"))) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const {
    status: statusParam,
    our_verdict: ourVerdictParam,
    big_firm: bigFirmParam,
    min_years: minYearsParam,
    working: workingParam,
    m365: m365Param,
    gta: gtaParam,
    stability: stabilityParam,
    canada: canadaParam,
    no_resume: noResumeParam,
    q: nameQueryParam,
    show_past_interviews: showPastInterviewsParam,
  } = resolvedSearchParams;
  const showPastInterviews = showPastInterviewsParam === "1";
  const nameQuery = (nameQueryParam ?? "").trim();
  const statuses = toParamArray(statusParam);
  const ourVerdicts = toParamArray(ourVerdictParam);
  const bigFirm = bigFirmParam === "yes" || bigFirmParam === "no" ? bigFirmParam : null;
  const YEARS_BUCKETS = ["under3", "3to5", "6to10", "11plus"];
  const minYears = toParamArray(minYearsParam).filter((v) => YEARS_BUCKETS.includes(v));
  const currentlyWorking = workingParam === "yes" || workingParam === "no" ? workingParam : null;
  const m365Management = m365Param === "yes" || m365Param === "no" ? m365Param : null;
  const gta = gtaParam === "yes" || gtaParam === "no" ? gtaParam : null;
  const stability =
    stabilityParam === "stable" || stabilityParam === "frequent_changes" ? stabilityParam : null;
  const canada = canadaParam === "yes" || canadaParam === "no" ? canadaParam : null;
  const noResumeYet = noResumeParam === "yes";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: connection },
    { data: postings },
    { data: allInterviews },
    { data: allMessages },
    { data: allInterviewNotes },
  ] = await Promise.all([
      supabase
        .from("mail_connections")
        .select("resume_folder_name, resume_sync_last_synced_at")
        .eq("user_id", user?.id ?? "")
        .maybeSingle(),
      supabase
        .from("job_postings")
        .select("id, title, description, created_at")
        .order("created_at", { ascending: false }),
      // Every invite ever sent, oldest first — both the top "Upcoming
      // interviews" section (filtered to now-or-later below, unless the
      // "show past" toggle is on) and each candidate's own interview history
      // in the table below are built from this one fetch. resumes(...) is a
      // nested embed via resume_interviews.resume_id's FK, not a separate
      // round-trip.
      supabase
        .from("resume_interviews")
        .select(
          "id, resume_id, scheduled_at, duration_minutes, location, rsvp_status, rsvp_at, teams_join_url, resumes(candidate_name, sender_name, candidate_email, sender_email)"
        )
        .order("scheduled_at", { ascending: true }),
      // Full two-way thread (both directions), oldest first — grouped by
      // resume_id below into each candidate's own Messages section.
      supabase
        .from("resume_messages")
        .select("id, resume_id, direction, body_text, sent_at")
        .order("sent_at", { ascending: true }),
      // Every interview note ever added, oldest first — grouped by
      // resume_id below into each candidate's own Interview Notes section.
      // profiles(...) is a nested embed via created_by's FK, not a separate
      // round-trip.
      supabase
        .from("resume_interview_notes")
        .select("id, resume_id, note_text, created_at, profiles(full_name)")
        .order("created_at", { ascending: true }),
    ]);

  const currentPosting = postings?.[0] ?? null;
  const pastPostings = postings?.slice(1) ?? [];

  type InterviewRow = {
    id: string;
    resume_id: string;
    scheduled_at: string;
    duration_minutes: number;
    location: string | null;
    rsvp_status: "accepted" | "declined" | "tentative" | null;
    rsvp_at: string | null;
    teams_join_url: string | null;
    resumes:
      | {
          candidate_name: string | null;
          sender_name: string | null;
          candidate_email: string | null;
          sender_email: string | null;
        }[]
      | null;
  };
  const interviews = (allInterviews ?? []) as InterviewRow[];

  const nowIso = new Date().toISOString();
  // Always ascending, same as the base query — filtering to a subset never
  // reorders it.
  const visibleInterviews = showPastInterviews
    ? interviews
    : interviews.filter((iv) => iv.scheduled_at >= nowIso);

  const interviewsByResumeId = new Map<string, InterviewRow[]>();
  for (const iv of interviews) {
    const list = interviewsByResumeId.get(iv.resume_id) ?? [];
    list.push(iv);
    interviewsByResumeId.set(iv.resume_id, list);
  }

  type MessageRow = {
    id: string;
    resume_id: string;
    direction: "inbound" | "outbound";
    body_text: string | null;
    sent_at: string;
  };
  const messagesByResumeId = new Map<string, MessageRow[]>();
  for (const m of (allMessages ?? []) as MessageRow[]) {
    const list = messagesByResumeId.get(m.resume_id) ?? [];
    list.push(m);
    messagesByResumeId.set(m.resume_id, list);
  }

  type InterviewNoteRow = {
    id: string;
    resume_id: string;
    note_text: string;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  };
  const notesByResumeId = new Map<string, InterviewNoteRow[]>();
  for (const n of (allInterviewNotes ?? []) as InterviewNoteRow[]) {
    const list = notesByResumeId.get(n.resume_id) ?? [];
    list.push(n);
    notesByResumeId.set(n.resume_id, list);
  }

  let resumeQuery = supabase
    .from("resumes")
    .select(
      "id, received_at, sender_name, sender_email, subject, file_name, email_body_text, pasted_resume_text, candidate_name, candidate_email, candidate_phone, ai_verdict, ai_comment, human_verdict, big_firm_experience, years_experience, currently_working, months_since_worked, in_gta, m365_technologies, job_stability, last_job_in_canada, screened_at, screening_error, status, ai_interview_analysis, ai_interview_analysis_at, final_decision",
      { count: "exact" }
    )
    .order("received_at", { ascending: false })
    .limit(200);
  if (nameQuery) {
    // PostgREST's `.or()` string treats commas/parens as syntax, so the
    // value is double-quote-wrapped (its own PostgREST escape hatch) rather
    // than sanitized/stripped — lets a name search safely contain those
    // characters instead of silently mangling them.
    const escaped = `"%${nameQuery.replace(/"/g, '\\"')}%"`;
    resumeQuery = resumeQuery.or(`candidate_name.ilike.${escaped},sender_name.ilike.${escaped}`);
  }
  if (statuses.length > 0) resumeQuery = resumeQuery.in("status", statuses);
  if (ourVerdicts.length > 0) resumeQuery = resumeQuery.in("human_verdict", ourVerdicts);
  if (bigFirm) resumeQuery = resumeQuery.eq("big_firm_experience", bigFirm === "yes");
  if (minYears.length > 0) {
    // Each bucket is its own OR'd clause — the two middle buckets need an
    // AND of two conditions (gte + lte), so those are wrapped in PostgREST's
    // and(...) group rather than expressed as flat comma-separated terms
    // (which .or() would otherwise read as one big OR across all four).
    const YEARS_CLAUSES: Record<string, string> = {
      under3: "years_experience.lt.3",
      "3to5": "and(years_experience.gte.3,years_experience.lte.5)",
      "6to10": "and(years_experience.gte.6,years_experience.lte.10)",
      "11plus": "years_experience.gte.11",
    };
    resumeQuery = resumeQuery.or(minYears.map((v) => YEARS_CLAUSES[v]).join(","));
  }
  if (currentlyWorking) resumeQuery = resumeQuery.eq("currently_working", currentlyWorking === "yes");
  // m365_technologies is a keyword list, not a boolean — "yes" filters to
  // non-null (some technology evidenced), "no" filters to null (none found).
  if (m365Management === "yes") resumeQuery = resumeQuery.not("m365_technologies", "is", null);
  else if (m365Management === "no") resumeQuery = resumeQuery.is("m365_technologies", null);
  if (gta) resumeQuery = resumeQuery.eq("in_gta", gta === "yes");
  if (stability) resumeQuery = resumeQuery.eq("job_stability", stability);
  if (canada) resumeQuery = resumeQuery.eq("last_job_in_canada", canada === "yes");
  // Matches recruitment-table.tsx's own hasResumeContent check (file_name ||
  // pasted_resume_text) rather than storage_path, which isn't selected here.
  if (noResumeYet) resumeQuery = resumeQuery.is("file_name", null).is("pasted_resume_text", null);
  const { data: resumes, count: totalCount } = await resumeQuery;

  const rows = (resumes ?? []) as RecruitmentTableRow[];

  // Flags candidates whose pasted resume text exactly matches another row in
  // the current (filtered, up-to-200) list — not a DB constraint, just a
  // display-time heads-up so staff can spot an accidental re-paste. Compares
  // normalized text (trimmed, collapsed whitespace, case-insensitive) so
  // trivial formatting differences from copy/paste don't hide a real match.
  const textGroups = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    if (!r.pasted_resume_text) continue;
    const key = r.pasted_resume_text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    const group = textGroups.get(key) ?? [];
    group.push({ id: r.id, name: r.candidate_name ?? r.sender_name ?? "an earlier entry" });
    textGroups.set(key, group);
  }
  const duplicateOfById = new Map<string, string>();
  for (const group of textGroups.values()) {
    if (group.length < 2) continue;
    for (const entry of group) {
      const other = group.find((g) => g.id !== entry.id);
      if (other) duplicateOfById.set(entry.id, other.name);
    }
  }
  const rowsWithDuplicates = rows.map((r) => ({
    ...r,
    duplicateOfName: duplicateOfById.get(r.id) ?? null,
    interviewHistory: (interviewsByResumeId.get(r.id) ?? []).map((iv) => ({
      id: iv.id,
      scheduledAt: iv.scheduled_at,
      durationMinutes: iv.duration_minutes,
      location: iv.location,
      rsvpStatus: iv.rsvp_status,
      teamsJoinUrl: iv.teams_join_url,
    })),
    messages: (messagesByResumeId.get(r.id) ?? []).map((m) => ({
      id: m.id,
      direction: m.direction,
      bodyText: m.body_text,
      sentAt: m.sent_at,
    })),
    interviewNotes: (notesByResumeId.get(r.id) ?? []).map((n) => {
      const profile = Array.isArray(n.profiles) ? n.profiles[0] : n.profiles;
      return {
        id: n.id,
        noteText: n.note_text,
        createdAt: n.created_at,
        authorName: profile?.full_name ?? null,
      };
    }),
  }));

  // Toggles ?show_past_interviews= while preserving every other current
  // filter param — built from the raw searchParams object rather than the
  // already-destructured individual filters, so this doesn't need updating
  // every time a new filter is added elsewhere on this page.
  const toggleInterviewsParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => toggleInterviewsParams.append(key, v));
    else toggleInterviewsParams.append(key, value);
  }
  if (showPastInterviews) toggleInterviewsParams.delete("show_past_interviews");
  else toggleInterviewsParams.set("show_past_interviews", "1");
  const toggleInterviewsHref = `/recruitment?${toggleInterviewsParams.toString()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Recruitment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Applicants pulled in from one folder in your connected mailbox, screened against
          your current job posting. A message with no resume attached still creates a row —
          click it to add the resume by upload or paste once you have one.
        </p>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Mailbox &amp; job posting settings
        </summary>
        <div className="grid items-start gap-6 border-t border-slate-100 p-6 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Mailbox</h2>
            <div className="mt-3">
              <ResumeFolderSettingsForm
                currentFolderName={connection?.resume_folder_name ?? ""}
                action={updateResumeFolderName}
              />
            </div>
            {connection?.resume_sync_last_synced_at && (
              <p className="mt-3 text-xs text-slate-400">
                Last synced {formatDate(connection.resume_sync_last_synced_at)}
              </p>
            )}
            <div className="mt-4">
              <AsyncActionButton
                label="Sync resumes now"
                pendingLabel="Syncing…"
                action={syncResumesNow}
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900">Current job posting</h2>
            <div className="mt-3">
              <JobPostingForm
                currentTitle={currentPosting?.title ?? ""}
                currentDescription={currentPosting?.description ?? ""}
                action={createJobPosting}
              />
            </div>
            {pastPostings.length > 0 && (
              <details className="mt-4 text-xs text-slate-500">
                <summary className="cursor-pointer">
                  {pastPostings.length} earlier posting{pastPostings.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 space-y-1">
                  {pastPostings.map((p: { id: string; title: string; created_at: string }) => (
                    <li key={p.id}>
                      {p.title} — {formatDate(p.created_at)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {showPastInterviews ? "Interviews" : "Upcoming interviews"}
          {visibleInterviews.length > 0 ? ` (${visibleInterviews.length})` : ""}
        </summary>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-2">
          <span className="text-xs text-slate-400">Always sorted soonest first.</span>
          <a href={toggleInterviewsHref} className="text-xs font-medium text-slate-500 underline">
            {showPastInterviews ? "Hide past interviews" : "Show past interviews"}
          </a>
        </div>
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {visibleInterviews.length === 0 ? (
            <p className="px-6 py-4 text-sm text-slate-500">Nothing scheduled yet.</p>
          ) : (
            visibleInterviews.map((iv: InterviewRow) => {
              const resumeInfo = Array.isArray(iv.resumes) ? iv.resumes[0] : iv.resumes;
              const name = resumeInfo?.candidate_name ?? resumeInfo?.sender_name ?? "Unnamed candidate";
              const email = resumeInfo?.candidate_email ?? resumeInfo?.sender_email;
              const isPast = iv.scheduled_at < nowIso;
              const when = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Toronto",
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              }).format(new Date(iv.scheduled_at));
              return (
                <div key={iv.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-6 py-2">
                  <p className={`w-56 shrink-0 text-sm font-medium ${isPast ? "text-slate-400" : "text-slate-900"}`}>
                    {name}
                  </p>
                  <p className={`text-sm ${isPast ? "text-slate-400" : "text-slate-700"}`}>
                    {when} · {iv.duration_minutes} min
                  </p>
                  {iv.rsvp_status && <Badge value={iv.rsvp_status} />}
                  {iv.location && <p className="text-xs text-slate-500">{iv.location}</p>}
                  {iv.teams_join_url && (
                    <a
                      href={iv.teams_join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Join Teams meeting
                    </a>
                  )}
                  {email && <p className="text-xs text-slate-400">{email}</p>}
                </div>
              );
            })
          )}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResumeFilterBar
          statuses={statuses}
          ourVerdicts={ourVerdicts}
          bigFirm={bigFirm}
          minYears={minYears}
          currentlyWorking={currentlyWorking}
          m365Management={m365Management}
          gta={gta}
          stability={stability}
          canada={canada}
          noResumeYet={noResumeYet}
          nameQuery={nameQuery}
          clearHref="/recruitment"
        />
        <div className="flex flex-wrap items-start gap-2">
          <AddCandidateForm action={addCandidateAction} />
          <BulkUploadResumesForm action={bulkUploadResumesAction} />
        </div>
      </div>

      <RecruitmentTable
        rows={rowsWithDuplicates}
        nameQuery={nameQuery}
        totalCount={totalCount ?? rowsWithDuplicates.length}
        updateStatusAction={updateResumeStatusAction}
        updateHumanVerdictAction={updateResumeHumanVerdictAction}
        updateFinalDecisionAction={updateFinalDecisionAction}
        addInterviewNoteAction={addInterviewNoteAction}
        uploadFileAction={uploadResumeFileAction}
        pasteTextAction={pasteResumeTextAction}
        deleteAction={deleteResumeAction}
        screenSelectedAction={screenSelectedResumesAction}
        screenPendingAction={screenPendingResumesAction}
        scheduleInterviewAction={scheduleInterviewAction}
        sendCandidateReplyAction={sendCandidateReplyAction}
        sendBulkMessageAction={sendBulkCandidateMessageAction}
      />
    </div>
  );
}
