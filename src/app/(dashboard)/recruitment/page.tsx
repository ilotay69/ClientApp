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
import {
  updateResumeFolderName,
  syncResumesNow,
  createJobPosting,
  screenPendingResumesAction,
  screenSelectedResumesAction,
  updateResumeStatusAction,
  uploadResumeFileAction,
  pasteResumeTextAction,
  deleteResumeAction,
  addCandidateAction,
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
    verdict?: string | string[];
    big_firm?: string;
    min_years?: string;
    working?: string;
    m365?: string;
    no_resume?: string;
  }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_recruitment"))) {
    redirect("/dashboard");
  }

  const {
    status: statusParam,
    verdict: verdictParam,
    big_firm: bigFirmParam,
    min_years: minYearsParam,
    working: workingParam,
    m365: m365Param,
    no_resume: noResumeParam,
  } = await searchParams;
  const statuses = toParamArray(statusParam);
  const verdicts = toParamArray(verdictParam);
  const bigFirm = bigFirmParam === "yes" || bigFirmParam === "no" ? bigFirmParam : null;
  const YEARS_BUCKETS = ["under3", "3to5", "6to10", "11plus"];
  const minYears = minYearsParam && YEARS_BUCKETS.includes(minYearsParam) ? minYearsParam : null;
  const currentlyWorking = workingParam === "yes" || workingParam === "no" ? workingParam : null;
  const m365Management = m365Param === "yes" || m365Param === "no" ? m365Param : null;
  const noResumeYet = noResumeParam === "yes";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: connection }, { data: postings }] = await Promise.all([
    supabase
      .from("mail_connections")
      .select("resume_folder_name, resume_sync_last_synced_at")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    supabase
      .from("job_postings")
      .select("id, title, description, additional_instructions, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const currentPosting = postings?.[0] ?? null;
  const pastPostings = postings?.slice(1) ?? [];

  let resumeQuery = supabase
    .from("resumes")
    .select(
      "id, received_at, sender_name, sender_email, subject, file_name, email_body_text, pasted_resume_text, candidate_name, candidate_email, candidate_phone, ai_verdict, ai_comment, big_firm_experience, years_experience, currently_working, months_since_worked, in_gta, m365_technologies, screened_at, screening_error, status"
    )
    .order("received_at", { ascending: false })
    .limit(200);
  if (statuses.length > 0) resumeQuery = resumeQuery.in("status", statuses);
  if (verdicts.length > 0) resumeQuery = resumeQuery.in("ai_verdict", verdicts);
  if (bigFirm) resumeQuery = resumeQuery.eq("big_firm_experience", bigFirm === "yes");
  if (minYears === "under3") resumeQuery = resumeQuery.lt("years_experience", 3);
  else if (minYears === "3to5") resumeQuery = resumeQuery.gte("years_experience", 3).lte("years_experience", 5);
  else if (minYears === "6to10") resumeQuery = resumeQuery.gte("years_experience", 6).lte("years_experience", 10);
  else if (minYears === "11plus") resumeQuery = resumeQuery.gte("years_experience", 11);
  if (currentlyWorking) resumeQuery = resumeQuery.eq("currently_working", currentlyWorking === "yes");
  // m365_technologies is a keyword list, not a boolean — "yes" filters to
  // non-null (some technology evidenced), "no" filters to null (none found).
  if (m365Management === "yes") resumeQuery = resumeQuery.not("m365_technologies", "is", null);
  else if (m365Management === "no") resumeQuery = resumeQuery.is("m365_technologies", null);
  // Matches recruitment-table.tsx's own hasResumeContent check (file_name ||
  // pasted_resume_text) rather than storage_path, which isn't selected here.
  if (noResumeYet) resumeQuery = resumeQuery.is("file_name", null).is("pasted_resume_text", null);
  const { data: resumes } = await resumeQuery;

  const rows = (resumes ?? []) as RecruitmentTableRow[];

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

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Current job posting</h2>
          <div className="mt-3">
            <JobPostingForm
              currentTitle={currentPosting?.title ?? ""}
              currentDescription={currentPosting?.description ?? ""}
              currentAdditionalInstructions={currentPosting?.additional_instructions ?? ""}
              action={createJobPosting}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AsyncActionButton
              label="Screen pending resumes"
              pendingLabel="Screening…"
              action={screenPendingResumesAction}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Only scores resumes that haven&apos;t been screened yet. To re-score
            specific candidates against a changed posting, check them in the table
            below and use &quot;Screen selected&quot;.
          </p>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResumeFilterBar
          statuses={statuses}
          verdicts={verdicts}
          bigFirm={bigFirm}
          minYears={minYears}
          currentlyWorking={currentlyWorking}
          m365Management={m365Management}
          noResumeYet={noResumeYet}
          clearHref="/recruitment"
        />
        <AddCandidateForm action={addCandidateAction} />
      </div>

      <RecruitmentTable
        rows={rows}
        updateStatusAction={updateResumeStatusAction}
        uploadFileAction={uploadResumeFileAction}
        pasteTextAction={pasteResumeTextAction}
        deleteAction={deleteResumeAction}
        screenSelectedAction={screenSelectedResumesAction}
      />
    </div>
  );
}
