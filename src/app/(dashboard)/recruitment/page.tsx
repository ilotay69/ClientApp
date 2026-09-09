import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { SyncResumesButton } from "@/components/sync-resumes-button";
import { ResumeFolderSettingsForm } from "@/components/resume-folder-settings-form";
import { updateResumeFolderName, syncResumesNow } from "./actions";
import type { Resume } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Step 2 of the Resume Screener build (see the plan): sync-and-store only,
 * verified end to end before any AI screening code is written. This page
 * intentionally has no verdict/comment/status columns yet — just enough to
 * confirm resumes are actually landing in the database and their PDFs are
 * actually landing in Storage. The filter bar, AI columns, and job-posting
 * editor are added on top of this in the next step.
 */
export default async function RecruitmentPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_recruitment"))) {
    redirect("/dashboard");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: connection } = await supabase
    .from("mail_connections")
    .select("resume_folder_name, resume_sync_last_synced_at")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const { data: resumes } = await supabase
    .from("resumes")
    .select(
      "id, received_at, sender_name, sender_email, subject, file_name, ai_verdict, status"
    )
    .order("received_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Recruitment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Resumes pulled in from one folder in your connected mailbox.
        </p>
      </div>

      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ResumeFolderSettingsForm
          currentFolderName={connection?.resume_folder_name ?? ""}
          action={updateResumeFolderName}
        />
        {connection?.resume_sync_last_synced_at && (
          <p className="mt-3 text-xs text-slate-400">
            Last synced {formatDate(connection.resume_sync_last_synced_at)}
          </p>
        )}
        <div className="mt-4">
          <SyncResumesButton action={syncResumesNow} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Date</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">From</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Subject</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">File</th>
              <th className="px-5 py-2 text-left font-medium text-slate-500">Screened?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {((resumes ?? []) as Pick<
              Resume,
              "id" | "received_at" | "sender_name" | "sender_email" | "subject" | "file_name" | "ai_verdict" | "status"
            >[]).map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2 text-slate-600">{formatDate(r.received_at)}</td>
                <td className="px-5 py-2 text-slate-600">{r.sender_name ?? r.sender_email ?? "—"}</td>
                <td className="px-5 py-2 text-slate-600">{r.subject ?? "—"}</td>
                <td className="px-5 py-2 text-slate-600">
                  <Link href={`/api/resumes/${r.id}`} className="text-brand underline">
                    {r.file_name}
                  </Link>
                </td>
                <td className="px-5 py-2 text-slate-600">{r.ai_verdict ?? "Not yet"}</td>
              </tr>
            ))}
            {(resumes ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">
                  No resumes synced yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
