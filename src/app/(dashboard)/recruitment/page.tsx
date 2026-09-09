import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import { AsyncActionButton } from "@/components/sync-resumes-button";
import { ResumeFolderSettingsForm } from "@/components/resume-folder-settings-form";
import { JobPostingForm } from "@/components/job-posting-form";
import { ResumeFilterBar } from "@/components/resume-filter-bar";
import { ResumeStatusSelect } from "@/components/resume-status-select";
import {
  updateResumeFolderName,
  syncResumesNow,
  createJobPosting,
  screenPendingResumesAction,
  updateResumeStatusAction,
} from "./actions";
import type { Resume, ResumeStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function toParamArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; verdict?: string | string[] }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_recruitment"))) {
    redirect("/dashboard");
  }

  const { status: statusParam, verdict: verdictParam } = await searchParams;
  const statuses = toParamArray(statusParam);
  const verdicts = toParamArray(verdictParam);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: connection }, { data: postings }] = await Promise.all([
    supabase
      .from("mail_connections")
      .select("resume_folder_name, resume_sync_last_synced_at")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    supabase.from("job_postings").select("id, title, description, created_at").order("created_at", { ascending: false }),
  ]);

  const currentPosting = postings?.[0] ?? null;
  const pastPostings = postings?.slice(1) ?? [];

  let resumeQuery = supabase
    .from("resumes")
    .select(
      "id, received_at, sender_name, sender_email, subject, file_name, candidate_name, candidate_email, candidate_phone, ai_verdict, ai_comment, screened_at, screening_error, status"
    )
    .order("received_at", { ascending: false })
    .limit(200);
  if (statuses.length > 0) resumeQuery = resumeQuery.in("status", statuses);
  if (verdicts.length > 0) resumeQuery = resumeQuery.in("ai_verdict", verdicts);
  const { data: resumes } = await resumeQuery;

  type ResumeRow = Pick<
    Resume,
    | "id"
    | "received_at"
    | "sender_name"
    | "sender_email"
    | "subject"
    | "file_name"
    | "candidate_name"
    | "candidate_email"
    | "candidate_phone"
    | "ai_verdict"
    | "ai_comment"
    | "screened_at"
    | "screening_error"
    | "status"
  >;
  const rows = (resumes ?? []) as ResumeRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Recruitment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Resumes pulled in from one folder in your connected mailbox, screened against
          your current job posting.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
              action={createJobPosting}
            />
          </div>
          <div className="mt-4">
            <AsyncActionButton
              label="Screen pending resumes"
              pendingLabel="Screening…"
              action={screenPendingResumesAction}
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

      <ResumeFilterBar statuses={statuses} verdicts={verdicts} clearHref="/recruitment" />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Date</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Name</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Phone</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Email</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Verdict</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Comment</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">File</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2 whitespace-nowrap text-slate-600">{formatDate(r.received_at)}</td>
                <td className="px-5 py-2 text-slate-900">{r.candidate_name ?? r.sender_name ?? "—"}</td>
                <td className="px-5 py-2 whitespace-nowrap text-slate-600">{r.candidate_phone ?? "—"}</td>
                <td className="px-5 py-2 text-slate-600">{r.candidate_email ?? r.sender_email ?? "—"}</td>
                <td className="px-5 py-2">
                  {r.ai_verdict ? (
                    <Badge value={r.ai_verdict} />
                  ) : r.screening_error ? (
                    <span title={r.screening_error} className="text-xs text-red-600 underline decoration-dotted">
                      Error
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Not screened</span>
                  )}
                </td>
                <td className="max-w-xs truncate px-5 py-2 text-slate-600" title={r.ai_comment ?? undefined}>
                  {r.ai_comment ?? "—"}
                </td>
                <td className="px-5 py-2">
                  <ResumeStatusSelect
                    resumeId={r.id}
                    value={r.status as ResumeStatus}
                    action={updateResumeStatusAction}
                  />
                </td>
                <td className="px-5 py-2 whitespace-nowrap">
                  <Link href={`/api/resumes/${r.id}`} className="text-brand underline">
                    {r.file_name}
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                  No resumes match this filter yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
