"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { DeleteButton } from "@/components/delete-button";
import { formatDate } from "@/lib/format";
import { ResumeStatusSelect } from "@/components/resume-status-select";
import type { Resume, ResumeStatus } from "@/lib/types";
import type { ResumeContentState } from "@/app/(dashboard)/recruitment/actions";

export type RecruitmentTableRow = Pick<
  Resume,
  | "id"
  | "received_at"
  | "sender_name"
  | "sender_email"
  | "subject"
  | "file_name"
  | "email_body_text"
  | "pasted_resume_text"
  | "candidate_name"
  | "candidate_email"
  | "candidate_phone"
  | "ai_verdict"
  | "ai_comment"
  | "big_firm_experience"
  | "years_experience"
  | "currently_working"
  | "screened_at"
  | "screening_error"
  | "status"
>;

/** Renders a boolean|null screening signal as a Yes/No badge, or "—" before
 * screening has run — reuses Badge's existing yes/no color mapping (see
 * badge.tsx) rather than introducing a separate one for the same meaning. */
function YesNoBadge({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  return <Badge value={value ? "yes" : "no"} />;
}

type ContentAction = (
  resumeId: string,
  prevState: ResumeContentState,
  formData: FormData
) => Promise<ResumeContentState>;

export function RecruitmentTable({
  rows,
  updateStatusAction,
  uploadFileAction,
  pasteTextAction,
  deleteAction,
}: {
  rows: RecruitmentTableRow[];
  updateStatusAction: (id: string, status: ResumeStatus) => Promise<void>;
  uploadFileAction: ContentAction;
  pasteTextAction: ContentAction;
  deleteAction: (id: string) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Date</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Name</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Verdict</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Big Firm</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Years Exp.</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Currently Working</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Comment</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Resume</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <ApplicantRow
              key={r.id}
              row={r}
              updateStatusAction={updateStatusAction}
              uploadFileAction={uploadFileAction}
              pasteTextAction={pasteTextAction}
              deleteAction={deleteAction}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">
                No resumes match this filter yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ApplicantRow({
  row,
  updateStatusAction,
  uploadFileAction,
  pasteTextAction,
  deleteAction,
}: {
  row: RecruitmentTableRow;
  updateStatusAction: (id: string, status: ResumeStatus) => Promise<void>;
  uploadFileAction: ContentAction;
  pasteTextAction: ContentAction;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResumeContent = Boolean(row.file_name || row.pasted_resume_text);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-5 py-2 whitespace-nowrap text-slate-600">{formatDate(row.received_at)}</td>
        <td className="px-5 py-2 text-slate-900">{row.candidate_name ?? row.sender_name ?? "—"}</td>
        <td className="px-5 py-2">
          {row.ai_verdict ? (
            <Badge value={row.ai_verdict} />
          ) : row.screening_error ? (
            <span title={row.screening_error} className="text-xs text-red-600 underline decoration-dotted">
              Error
            </span>
          ) : (
            <span className="text-xs text-slate-400">Not screened</span>
          )}
        </td>
        <td className="px-5 py-2">
          <YesNoBadge value={row.big_firm_experience} />
        </td>
        <td className="px-5 py-2 whitespace-nowrap text-slate-600">{row.years_experience ?? "—"}</td>
        <td className="px-5 py-2">
          <YesNoBadge value={row.currently_working} />
        </td>
        {/* whitespace-pre-line, not whitespace-normal — the AI comment is
            now two sections (technical ability / customer relationships)
            joined by a blank line; pre-line keeps that line break instead
            of collapsing it into one run-on paragraph, while still
            wrapping normally like whitespace-normal did. */}
        <td className="min-w-[22rem] whitespace-pre-line px-5 py-2 text-slate-600">
          {row.ai_comment ?? "—"}
        </td>
        <td className="px-5 py-2" onClick={(e) => e.stopPropagation()}>
          <ResumeStatusSelect
            resumeId={row.id}
            value={row.status as ResumeStatus}
            action={updateStatusAction}
          />
        </td>
        <td className="px-5 py-2 whitespace-nowrap">
          {row.file_name ? (
            <Link
              href={`/api/resumes/${row.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-brand underline"
            >
              {row.file_name}
            </Link>
          ) : row.pasted_resume_text ? (
            <span className="text-xs text-slate-500">Pasted text</span>
          ) : (
            <span className="text-xs font-medium text-amber-600">No resume yet</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="space-y-4 border-t border-slate-100 bg-slate-50 px-5 py-4">
            {(row.candidate_email || row.sender_email || row.candidate_phone) && (
              <p className="text-xs text-slate-500">
                Contact: {[row.candidate_email ?? row.sender_email, row.candidate_phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {row.subject && (
              <p className="text-xs text-slate-400">
                Subject: {row.subject}
              </p>
            )}
            {row.email_body_text && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Application email content
                </summary>
                <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-white p-3 text-sm text-slate-700">
                  {row.email_body_text}
                </p>
              </details>
            )}
            {row.pasted_resume_text && (
              <details className="text-sm" open={!hasResumeContent}>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Pasted resume text
                </summary>
                <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-white p-3 text-sm text-slate-700">
                  {row.pasted_resume_text}
                </p>
              </details>
            )}

            <AddResumeContent
              resumeId={row.id}
              hasResumeContent={hasResumeContent}
              uploadFileAction={uploadFileAction}
              pasteTextAction={pasteTextAction}
            />

            <div onClick={(e) => e.stopPropagation()}>
              <DeleteButton
                action={deleteAction.bind(null, row.id)}
                confirmText={`Delete this applicant${row.candidate_name ? ` (${row.candidate_name})` : ""}? This can't be undone.`}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AddResumeContent({
  resumeId,
  hasResumeContent,
  uploadFileAction,
  pasteTextAction,
}: {
  resumeId: string;
  hasResumeContent: boolean;
  uploadFileAction: ContentAction;
  pasteTextAction: ContentAction;
}) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [formOpen, setFormOpen] = useState(!hasResumeContent);
  const [uploadState, uploadFormAction, uploadPending] = useActionState<ResumeContentState, FormData>(
    uploadFileAction.bind(null, resumeId),
    { error: null }
  );
  const [pasteState, pasteFormAction, pastePending] = useActionState<ResumeContentState, FormData>(
    pasteTextAction.bind(null, resumeId),
    { error: null }
  );
  const uploadSubmittedRef = useRef(false);
  const pasteSubmittedRef = useRef(false);

  // Collapses the form back down once a save actually succeeds — checking
  // state.error alone isn't enough, since it's also null before any submit
  // has happened at all; the ref marks a real submit just occurred.
  useEffect(() => {
    if (uploadSubmittedRef.current && !uploadPending && !uploadState.error) {
      uploadSubmittedRef.current = false;
      setFormOpen(false);
    }
  }, [uploadPending, uploadState.error]);
  useEffect(() => {
    if (pasteSubmittedRef.current && !pastePending && !pasteState.error) {
      pasteSubmittedRef.current = false;
      setFormOpen(false);
    }
  }, [pastePending, pasteState.error]);

  if (!formOpen) {
    return (
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
        <p className="text-xs text-emerald-600">Resume saved.</p>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="text-xs font-medium text-slate-500 underline"
        >
          Replace resume
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {hasResumeContent ? "Replace resume" : "Add a resume"}
      </p>
      <div className="mt-2 flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-md px-2 py-1 font-medium ${
            mode === "upload" ? "bg-charcoal text-white" : "border border-slate-300 text-slate-700"
          }`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded-md px-2 py-1 font-medium ${
            mode === "paste" ? "bg-charcoal text-white" : "border border-slate-300 text-slate-700"
          }`}
        >
          Paste text
        </button>
      </div>

      {mode === "upload" ? (
        <form
          action={uploadFormAction}
          onSubmit={() => {
            uploadSubmittedRef.current = true;
          }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <input
            type="file"
            name="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            className="text-xs"
          />
          <button
            type="submit"
            disabled={uploadPending}
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {uploadPending ? "Uploading…" : "Save"}
          </button>
          {uploadState.error && <p className="w-full text-xs text-red-600">{uploadState.error}</p>}
        </form>
      ) : (
        <form
          action={pasteFormAction}
          onSubmit={() => {
            pasteSubmittedRef.current = true;
          }}
          className="mt-2 space-y-2"
        >
          <textarea
            name="text"
            rows={6}
            placeholder="Paste the resume text here…"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pastePending}
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pastePending ? "Saving…" : "Save"}
          </button>
          {pasteState.error && <p className="text-xs text-red-600">{pasteState.error}</p>}
        </form>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Saving here doesn&apos;t screen automatically — click &quot;Screen pending resumes&quot;
        above whenever you&apos;re ready.
      </p>
    </div>
  );
}
