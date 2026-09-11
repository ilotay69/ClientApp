"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { DeleteButton } from "@/components/delete-button";
import { IndeterminateProgressBar } from "@/components/progress-bar";
import { ScreenPendingResumesButton } from "@/components/screen-pending-resumes-button";
import { ScheduleInterviewForm } from "@/components/schedule-interview-form";
import { CandidateReplyForm } from "@/components/candidate-reply-form";
import type {
  ResumeScreenState,
  ScheduleInterviewState,
  SendCandidateReplyState,
} from "@/app/(dashboard)/recruitment/actions";
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
  | "job_stability"
  | "last_job_in_canada"
  | "screened_at"
  | "screening_error"
  | "status"
> & {
  /** Name of another row in the current list whose pasted resume text
   * matches this one's (see page.tsx) — null when no match. Computed at
   * display time, not stored. */
  duplicateOfName?: string | null;
  /** Every interview invite ever sent for this candidate, oldest first —
   * from resume_interviews (see page.tsx), not stored on the resume row
   * itself. */
  interviewHistory?: {
    id: string;
    scheduledAt: string;
    durationMinutes: number;
    location: string | null;
    rsvpStatus: "accepted" | "declined" | "tentative" | null;
    teamsJoinUrl: string | null;
  }[];
  /** Full message thread (both directions) with this candidate through the
   * shared recruitment mailbox — from resume_messages (see page.tsx). */
  messages?: {
    id: string;
    direction: "inbound" | "outbound";
    bodyText: string | null;
    sentAt: string;
  }[];
};

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

type SortKey =
  | "date"
  | "name"
  | "verdict"
  | "big_firm"
  | "years_exp"
  | "working"
  | "gta"
  | "tech"
  | "stability"
  | "ca"
  | "status";

// Status is a workflow, not alphabetical text — sorting it needs to follow
// the actual stage order (see resume-status-select.tsx), not string order,
// or "contacting" would wrongly sort after "hired".
const STATUS_RANK: Record<ResumeStatus, number> = {
  new: 0,
  reviewing: 1,
  contacting: 2,
  invited: 3,
  interviewing: 4,
  rejected: 5,
  hired: 6,
};

function sortValue(row: RecruitmentTableRow, key: SortKey): string | number | boolean | null {
  switch (key) {
    case "date":
      return new Date(row.received_at).getTime();
    case "name":
      return (row.candidate_name ?? row.sender_name ?? "").toLowerCase();
    case "verdict":
      return row.ai_verdict;
    case "big_firm":
      return row.big_firm_experience;
    case "years_exp":
      return row.years_experience;
    case "working":
      return row.currently_working;
    case "gta":
      return row.in_gta;
    case "tech":
      return (row.m365_technologies ?? "").toLowerCase();
    case "stability":
      return row.job_stability;
    case "ca":
      return row.last_job_in_canada;
    case "status":
      return STATUS_RANK[row.status];
  }
}

// Nulls always sort last regardless of direction — an unscreened/unknown
// value isn't meaningfully "less than" a known one in either order.
function compareRows(a: RecruitmentTableRow, b: RecruitmentTableRow, key: SortKey, dir: "asc" | "desc"): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
  if (bv === null || bv === undefined) return -1;

  let cmp: number;
  if (typeof av === "boolean" || typeof bv === "boolean") {
    cmp = Number(av) - Number(bv);
  } else if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv));
  }
  return dir === "asc" ? cmp : -cmp;
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className="sticky top-0 z-10 cursor-pointer select-none bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500 hover:text-slate-700"
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="w-2.5 text-[10px] text-slate-400">{active ? (dir === "asc" ? "▲" : "▼") : ""}</span>
      </span>
    </th>
  );
}

export function RecruitmentTable({
  rows,
  nameQuery,
  totalCount,
  updateStatusAction,
  uploadFileAction,
  pasteTextAction,
  deleteAction,
  screenSelectedAction,
  screenPendingAction,
  scheduleInterviewAction,
  sendCandidateReplyAction,
  sendBulkMessageAction,
}: {
  rows: RecruitmentTableRow[];
  nameQuery: string;
  totalCount: number;
  updateStatusAction: (id: string, status: ResumeStatus) => Promise<void>;
  uploadFileAction: ContentAction;
  pasteTextAction: ContentAction;
  deleteAction: (id: string) => Promise<void>;
  scheduleInterviewAction: (
    resumeId: string,
    prev: ScheduleInterviewState,
    formData: FormData
  ) => Promise<ScheduleInterviewState>;
  sendCandidateReplyAction: (
    resumeId: string,
    prev: SendCandidateReplyState,
    formData: FormData
  ) => Promise<SendCandidateReplyState>;
  sendBulkMessageAction: (
    resumeIds: string[],
    body: string,
    link: string | null,
    linkLabel: string | null
  ) => Promise<{ ok: boolean; message: string; sent?: number; errored?: number }>;
  screenSelectedAction: (
    resumeIds: string[]
  ) => Promise<{ ok: boolean; message: string; screened?: number; errored?: number }>;
  screenPendingAction: () => Promise<ResumeScreenState>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [searchValue, setSearchValue] = useState(nameQuery);
  // Accordion, not independent per-row state: at most one candidate's detail
  // is open at a time, so opening another one collapses whichever was open.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Full-navigation GET rather than SPA routing, matching every other filter
  // on this page — reads the other, currently-active filters straight off
  // the browser URL rather than needing them threaded through as props, so
  // updating just ?q= here can't clobber status/verdict/etc. chips set via
  // ResumeFilterBar's own form.
  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(window.location.search);
    const trimmed = searchValue.trim();
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    window.location.href = `/recruitment?${params.toString()}`;
  }

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

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  // Same reasoning as ScreenPendingResumesButton: screenPendingResumes
  // processes a resumeIds selection uncapped, in sequential 5-per-call
  // Anthropic batches — sending a large selection (100+ resumes) as one
  // Server Action request risks outliving Railway's own request timeout,
  // surfacing as a generic "This page couldn't load" rather than any error
  // this component gets a chance to show. Chunking here instead keeps each
  // request to one Anthropic call, same as a small selection always was.
  const SELECT_SCREEN_CHUNK_SIZE = 5;

  function runScreenSelected() {
    setResult(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      let screened = 0;
      let errored = 0;
      for (let i = 0; i < ids.length; i += SELECT_SCREEN_CHUNK_SIZE) {
        const chunk = ids.slice(i, i + SELECT_SCREEN_CHUNK_SIZE);
        const outcome = await screenSelectedAction(chunk);
        if (!outcome.ok) {
          setResult(outcome);
          return;
        }
        screened += outcome.screened ?? 0;
        errored += outcome.errored ?? 0;
        const done = i + SELECT_SCREEN_CHUNK_SIZE >= ids.length;
        setResult({
          ok: true,
          message: `Screened ${screened}, ${errored} error${errored === 1 ? "" : "s"}${done ? "." : "…"}`,
        });
      }
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ScreenPendingResumesButton action={screenPendingAction} />

        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

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

        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <BulkMessageForm
          selectedIds={Array.from(selected)}
          action={sendBulkMessageAction}
          onSent={() => setSelected(new Set())}
        />

        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search by name…"
            className="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Search
          </button>
        </form>
        <span className="text-xs text-slate-500">
          {totalCount} resume{totalCount === 1 ? "" : "s"}
        </span>
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
              <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Verdict" sortKey="verdict" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Big Firm" sortKey="big_firm" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Years Exp." sortKey="years_exp" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Working" sortKey="working" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="GTA" sortKey="gta" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="365 Tech" sortKey="tech" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Stability" sortKey="stability" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="CA" sortKey="ca" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="sticky top-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium text-slate-500">Resume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRows.map((r) => (
              <ApplicantRow
                key={r.id}
                row={r}
                selected={selected.has(r.id)}
                onToggleSelected={() => toggleOne(r.id)}
                expanded={expandedId === r.id}
                onToggleExpanded={() => toggleExpanded(r.id)}
                updateStatusAction={updateStatusAction}
                uploadFileAction={uploadFileAction}
                pasteTextAction={pasteTextAction}
                deleteAction={deleteAction}
                scheduleInterviewAction={scheduleInterviewAction}
                sendCandidateReplyAction={sendCandidateReplyAction}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-5 py-8 text-center text-sm text-slate-500">
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

/** Sends one message (with an optional booking-link button) to every
 * selected candidate at once — for the "here's a link, book your own slot"
 * flow rather than staff scheduling each interview individually. Collapsed
 * behind a button, same UX shape as ScheduleInterviewForm, since it needs a
 * selection to make sense first. */
function BulkMessageForm({
  selectedIds,
  action,
  onSent,
}: {
  selectedIds: string[];
  action: (
    resumeIds: string[],
    body: string,
    link: string | null,
    linkLabel: string | null
  ) => Promise<{ ok: boolean; message: string; sent?: number; errored?: number }>;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("Book your interview time");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Same reasoning as runScreenSelected above — chunk the recipient list so
  // a large selection can't outlive the platform's own request timeout.
  const CHUNK_SIZE = 5;

  function runSend() {
    const trimmedBody = body.trim();
    if (!trimmedBody || selectedIds.length === 0) return;
    setResult(null);
    const trimmedLink = link.trim() || null;
    const trimmedLabel = linkLabel.trim() || null;
    startTransition(async () => {
      let sent = 0;
      let errored = 0;
      for (let i = 0; i < selectedIds.length; i += CHUNK_SIZE) {
        const chunk = selectedIds.slice(i, i + CHUNK_SIZE);
        const outcome = await action(chunk, trimmedBody, trimmedLink, trimmedLabel);
        if (!outcome.ok) {
          setResult(outcome);
          return;
        }
        sent += outcome.sent ?? 0;
        errored += outcome.errored ?? 0;
        const done = i + CHUNK_SIZE >= selectedIds.length;
        setResult({
          ok: true,
          message: `Sent ${sent}${errored > 0 ? `, ${errored} error${errored === 1 ? "" : "s"}` : ""}${done ? "." : "…"}`,
        });
      }
      setBody("");
      setLink("");
      setOpen(false);
      onSent();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={selectedIds.length === 0}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        Send message{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
      </button>
    );
  }

  return (
    <div className="w-full rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Send message to {selectedIds.length} selected candidate{selectedIds.length === 1 ? "" : "s"}
      </p>
      <div className="mt-2 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Write your message…"
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Booking link (optional), e.g. https://calendly.com/…"
            className="min-w-[16rem] flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
          <input
            type="text"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Link button text"
            className="w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runSend}
            disabled={pending || !body.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Sending…" : `Send to ${selectedIds.length}`}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 underline"
          >
            Cancel
          </button>
          {pending && <IndeterminateProgressBar />}
        </div>
        {result && (
          <p className={`text-xs ${result.ok ? "text-emerald-600" : "text-red-600"}`}>{result.message}</p>
        )}
      </div>
    </div>
  );
}

function ApplicantRow({
  row,
  selected,
  onToggleSelected,
  expanded,
  onToggleExpanded,
  updateStatusAction,
  uploadFileAction,
  pasteTextAction,
  deleteAction,
  scheduleInterviewAction,
  sendCandidateReplyAction,
}: {
  row: RecruitmentTableRow;
  selected: boolean;
  onToggleSelected: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  updateStatusAction: (id: string, status: ResumeStatus) => Promise<void>;
  uploadFileAction: ContentAction;
  pasteTextAction: ContentAction;
  deleteAction: (id: string) => Promise<void>;
  scheduleInterviewAction: (
    resumeId: string,
    prev: ScheduleInterviewState,
    formData: FormData
  ) => Promise<ScheduleInterviewState>;
  sendCandidateReplyAction: (
    resumeId: string,
    prev: SendCandidateReplyState,
    formData: FormData
  ) => Promise<SendCandidateReplyState>;
}) {
  const hasResumeContent = Boolean(row.file_name || row.pasted_resume_text);
  const { overview, detail } = splitComment(row.ai_comment);

  // Marks a still-"new" candidate as "reviewing" the first time staff
  // actually opens their row — a ref (not state) so rapid expand/collapse
  // toggling before the server round-trip lands can't fire this twice; it
  // naturally resets on the next real page load once row.status itself
  // comes back as something other than "new".
  const autoMarkedReviewingRef = useRef(false);

  function handleRowClick() {
    const opening = !expanded;
    if (opening && row.status === "new" && !autoMarkedReviewingRef.current) {
      autoMarkedReviewingRef.current = true;
      updateStatusAction(row.id, "reviewing");
    }
    onToggleExpanded();
  }

  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-50" onClick={handleRowClick}>
        <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select ${row.candidate_name ?? row.sender_name ?? "this candidate"}`}
          />
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{formatDate(row.received_at)}</td>
        <td className="px-3 py-1.5 text-slate-900">
          {row.candidate_name ?? row.sender_name ?? "—"}
          {row.duplicateOfName && (
            <span
              title={`Pasted resume text matches ${row.duplicateOfName}`}
              className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
            >
              Duplicate
            </span>
          )}
        </td>
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
        <td className="px-3 py-1.5">
          {row.job_stability ? (
            <Badge value={row.job_stability} />
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-3 py-1.5">
          <YesNoBadge value={row.last_job_in_canada} />
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
          <td colSpan={13} className="space-y-4 border-t border-slate-100 bg-slate-50 px-5 py-4">
            {(row.candidate_email || row.sender_email || row.candidate_phone) && (
              <p className="text-xs text-slate-500">
                Contact:{" "}
                {(() => {
                  const email = row.candidate_email ?? row.sender_email;
                  return (
                    <>
                      {email && (
                        <a
                          href={`mailto:${email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-brand underline"
                        >
                          {email}
                        </a>
                      )}
                      {email && row.candidate_phone && " · "}
                      {row.candidate_phone}
                    </>
                  );
                })()}
              </p>
            )}
            {row.subject && (
              <p className="text-xs text-slate-400">
                Subject: {row.subject}
              </p>
            )}
            {row.interviewHistory && row.interviewHistory.length > 0 && (
              <div className="text-xs">
                <p className="font-semibold uppercase tracking-wider text-slate-500">
                  Interview history
                </p>
                <ul className="mt-1 space-y-0.5">
                  {row.interviewHistory.map((iv) => (
                    <li key={iv.id} className="flex items-center gap-1.5 text-slate-600">
                      <span>
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: "America/Toronto",
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZoneName: "short",
                        }).format(new Date(iv.scheduledAt))}{" "}
                        · {iv.durationMinutes} min
                        {iv.location ? ` · ${iv.location}` : ""}
                      </span>
                      {iv.rsvpStatus && <Badge value={iv.rsvpStatus} />}
                      {iv.teamsJoinUrl && (
                        <a
                          href={iv.teamsJoinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-indigo-600 hover:underline"
                        >
                          Join Teams meeting
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="max-w-xl text-sm" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Messages
              </p>
              {row.messages && row.messages.length > 0 && (
                <ul className="mt-1 max-h-64 space-y-2 overflow-y-auto rounded-md bg-white p-3">
                  {row.messages.map((m) => (
                    <li key={m.id} className={m.direction === "outbound" ? "text-right" : "text-left"}>
                      <span
                        className={`inline-block min-w-[6rem] max-w-[85%] rounded-md px-3 py-2 text-left ${
                          m.direction === "outbound"
                            ? "bg-brand/10 text-slate-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        <span className="block whitespace-pre-line">{m.bodyText}</span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {m.direction === "outbound" ? "You" : "Candidate"} ·{" "}
                          {formatDate(m.sentAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2">
                <CandidateReplyForm
                  resumeId={row.id}
                  action={sendCandidateReplyAction}
                  extraActions={
                    <ScheduleInterviewForm resumeId={row.id} action={scheduleInterviewAction} />
                  }
                />
              </div>
            </div>
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
