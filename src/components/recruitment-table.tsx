"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { DeleteButton } from "@/components/delete-button";
import { IndeterminateProgressBar } from "@/components/progress-bar";
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
  | "months_since_worked"
  | "in_gta"
  | "m365_technologies"
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

/** ai_comment is one combined string (see screenPendingResumes) — splits
 * its leading "Overview: ..." paragraph back out from the Technical
 * ability / Building customer relationships detail. Both only ever show
 * in the expanded row now — the collapsed list shows the 365 Tech/Big
 * Firm/GTA/etc. signal columns instead. A comment screened before the
 * Overview field existed has no such paragraph — falls back to holding
 * the whole thing as detail with no separate overview line. */
function splitComment(comment: string | null): { overview: string | null; detail: string | null } {
  if (!comment) return { overview: null, detail: null };
  const [first, ...rest] = comment.split("\n\n");
  if (first?.startsWith("Overview:")) {
    return { overview: first, detail: rest.join("\n\n") || null };
  }
  return { overview: null, detail: comment };
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
  screenSelectedAction,
}: {
  rows: RecruitmentTableRow[];
  updateStatusAction: (id: string, status: ResumeStatus) => Promise<void>;
  uploadFileAction: ContentAction;
  pasteTextAction: ContentAction;
  deleteAction: (id: string) => Promise<void>;
  screenSelectedAction: (resumeIds: string[]) => Promise<{ ok: boolean; message: string }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runScreenSelected() {
    setResult(null);
    startTransition(async () => {
      const outcome = await screenSelectedAction(Array.from(selected));
      setResult(outcome);
      if (outcome.ok) setSelected(new Set());
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runScreenSelected}
          disabled={pending || selected.size === 0}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Screening…" : `Screen selected${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </button>
        {pending && <IndeterminateProgressBar />}
        {result && (
          <span className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>
            {result.message}
          </span>
        )}
      </div>

      {/* overflow-y-visible is deliberate, not redundant: overflow-x-auto
          alone makes the browser compute overflow-y as auto too, which turns
          this div into its own (never-actually-scrolling, since its height
          isn't constrained) vertical scroll container — that steals the
          sticky thead's positioning context away from the real page scroll,
          which is exactly why the sticky header did nothing. */}
      <div className="overflow-x-auto overflow-y-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* border-separate + border-spacing-0: Tailwind's Preflight reset
            sets border-collapse: collapse on every table by default, and
            sticky positioning on th/thead is well known to silently fail
            under collapsed borders in several browsers — separate mode
            (with zero spacing, so nothing visually changes) fixes that
            without touching the divide-y row borders, which are applied
            per-row rather than per-cell and don't depend on collapse mode. */}
        <table className="border-separate border-spacing-0 divide-y divide-slate-200 text-sm">
          {/* sticky goes on each th, not the thead — thead itself is
              unreliable across browsers for sticky positioning; th (and tr)
              is the well-supported target. */}
          <thead>
            <tr>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Date</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Name</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Verdict</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Big Firm</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Years Exp.</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Working</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">GTA</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">365 Tech</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Status</th>
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Resume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <ApplicantRow
                key={r.id}
                row={r}
                selected={selected.has(r.id)}
                onToggleSelected={() => toggleOne(r.id)}
                updateStatusAction={updateStatusAction}
                uploadFileAction={uploadFileAction}
                pasteTextAction={pasteTextAction}
                deleteAction={deleteAction}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-5 py-8 text-center text-sm text-slate-500">
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

function ApplicantRow({
  row,
  selected,
  onToggleSelected,
  updateStatusAction,
  uploadFileAction,
  pasteTextAction,
  deleteAction,
}: {
  row: RecruitmentTableRow;
  selected: boolean;
  onToggleSelected: () => void;
  updateStatusAction: (id: string, status: ResumeStatus) => Promise<void>;
  uploadFileAction: ContentAction;
  pasteTextAction: ContentAction;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResumeContent = Boolean(row.file_name || row.pasted_resume_text);
  const { overview, detail } = splitComment(row.ai_comment);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select ${row.candidate_name ?? row.sender_name ?? "this candidate"}`}
          />
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{formatDate(row.received_at)}</td>
        <td className="px-3 py-1.5 text-slate-900">{row.candidate_name ?? row.sender_name ?? "—"}</td>
        <td className="px-3 py-1.5">
          {/* Shown together, not either/or: an old verdict from a prior
              successful screen must never hide a LATER screening_error —
              a failed re-screen still sets screening_error on a row that
              already has ai_verdict from before, and showing only the
              stale badge would silently hide that the retry failed. */}
          <div className="flex items-center gap-1.5">
            {row.ai_verdict && <Badge value={row.ai_verdict} />}
            {row.screening_error && (
              <span
                title={row.screening_error}
                className="text-xs text-red-600 underline decoration-dotted"
              >
                {row.ai_verdict ? "Retry failed" : "Error"}
              </span>
            )}
            {!row.ai_verdict && !row.screening_error && (
              <span className="text-xs text-slate-400">Not screened</span>
            )}
          </div>
        </td>
        <td className="px-3 py-1.5">
          <YesNoBadge value={row.big_firm_experience} />
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{row.years_experience ?? "—"}</td>
        <td className="px-3 py-1.5 whitespace-nowrap">
          <YesNoBadge value={row.currently_working} />
          {row.currently_working === false && row.months_since_worked !== null && (
            <span className="ml-1 text-xs text-slate-500">{row.months_since_worked}mo</span>
          )}
        </td>
        <td className="px-3 py-1.5">
          <YesNoBadge value={row.in_gta} />
        </td>
        <td className="min-w-[10rem] max-w-[16rem] px-3 py-1.5 text-slate-700">
          {row.m365_technologies ?? <span className="text-xs text-slate-400">—</span>}
        </td>
        <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
          <ResumeStatusSelect
            resumeId={row.id}
            value={row.status as ResumeStatus}
            action={updateStatusAction}
          />
        </td>
        <td className="max-w-[9rem] px-3 py-1.5">
          {row.file_name ? (
            <Link
              href={`/api/resumes/${row.id}`}
              onClick={(e) => e.stopPropagation()}
              title={row.file_name}
              className="block truncate text-brand underline"
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
          <td colSpan={11} className="space-y-4 border-t border-slate-100 bg-slate-50 px-5 py-4">
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
            {overview && (
              <p className="whitespace-pre-line text-sm font-medium text-slate-900">{overview}</p>
            )}
            {detail && (
              <p className="whitespace-pre-line text-sm text-slate-700">{detail}</p>
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
          {uploadPending && <IndeterminateProgressBar />}
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
          {pastePending && <IndeterminateProgressBar />}
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
