"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import { IconChevronDown } from "@/components/icons";
import { ProjectTaskQuickAdd } from "@/components/project-task-quick-add";
import { AutotaskQuotePicker } from "@/components/autotask-quote-picker";
import { ProjectDocumentUpload } from "@/components/project-document-upload";
import { DeleteButton } from "@/components/delete-button";
import type {
  ProjectTask,
  ProjectQuoteLogEntry,
  ProjectNote,
  ProjectDocument,
  FormState as ProjectFormState,
} from "@/app/(dashboard)/projects/actions";
import type { FormState, AutotaskQuoteOption } from "@/app/(dashboard)/clients/actions";
import type { FormState as TaskFormState } from "@/app/(dashboard)/tasks/actions";

const initialNoteState: ProjectFormState = { error: null };

export type ProjectRowData = {
  id: string;
  name: string;
  status: string;
  client_id: string;
  hasAutotaskCompany: boolean;
  quotedHours: number | null;
  actualHours: number | null;
  daysOpen: number;
};

/** Under 50% used = low, 50-90% = medium, over 90% = high — null when
 * either side of the ratio isn't known yet. */
function hoursUsageLevel(actualHours: number | null, quotedHours: number | null) {
  if (actualHours === null || quotedHours === null || quotedHours <= 0) return null;
  const ratio = actualHours / quotedHours;
  if (ratio > 0.9) return "high";
  if (ratio >= 0.5) return "medium";
  return "low";
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function QuotedHoursEditor({
  projectId,
  hours,
  action,
}: {
  projectId: string;
  hours: number | null;
  action: (projectId: string, hours: number | null) => Promise<{ error: string | null }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hours !== null ? String(hours) : "");
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(hours !== null ? String(hours) : "");
          setEditing(true);
        }}
        className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-slate-500 hover:bg-slate-100"
      >
        {hours !== null ? `${formatHours(hours)} quoted` : "Set quoted hours"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      min={0}
      step={0.5}
      defaultValue={draft}
      disabled={isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const parsed = draft.trim() === "" ? null : Number(draft);
        if (parsed !== hours && !(parsed !== null && Number.isNaN(parsed))) {
          startTransition(() => {
            action(projectId, parsed);
          });
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(hours !== null ? String(hours) : "");
          setEditing(false);
        }
      }}
      className="w-20 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
    />
  );
}

export function ProjectRow({
  project,
  clientName,
  members,
  fetchTasksAction,
  createTaskAction,
  listAutotaskQuotesAction,
  logAutotaskQuoteAction,
  fetchQuoteLogAction,
  fetchNotesAction,
  addNoteAction,
  fetchDocumentsAction,
  uploadDocumentAction,
  deleteDocumentAction,
  updateQuotedHoursAction,
}: {
  project: ProjectRowData;
  clientName: string | null;
  members: { id: string; full_name: string }[];
  fetchTasksAction: (projectId: string) => Promise<{ tasks: ProjectTask[] } | { error: string }>;
  createTaskAction: (prevState: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  listAutotaskQuotesAction: (
    clientId: string
  ) => Promise<{ quotes: AutotaskQuoteOption[] } | { error: string }>;
  logAutotaskQuoteAction: (
    clientId: string,
    projectId: string,
    quote: AutotaskQuoteOption
  ) => Promise<FormState>;
  fetchQuoteLogAction: (
    projectId: string
  ) => Promise<{ entries: ProjectQuoteLogEntry[] } | { error: string }>;
  fetchNotesAction: (projectId: string) => Promise<{ notes: ProjectNote[] } | { error: string }>;
  addNoteAction: (prevState: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  fetchDocumentsAction: (
    projectId: string
  ) => Promise<{ documents: ProjectDocument[] } | { error: string }>;
  uploadDocumentAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  updateQuotedHoursAction: (projectId: string, hours: number | null) => Promise<{ error: string | null }>;
  deleteDocumentAction: (interactionId: string) => Promise<void>;
}) {
  const hoursUsage = hoursUsageLevel(project.actualHours, project.quotedHours);
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<ProjectTask[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [loadingTasks, startLoadTasks] = useTransition();
  const [quoteLog, setQuoteLog] = useState<ProjectQuoteLogEntry[] | null>(null);
  const [quoteLogError, setQuoteLogError] = useState<string | null>(null);
  const [loadingQuoteLog, startLoadQuoteLog] = useTransition();
  const [notes, setNotes] = useState<ProjectNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [loadingNotes, startLoadNotes] = useTransition();
  const [documents, setDocuments] = useState<ProjectDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [loadingDocuments, startLoadDocuments] = useTransition();

  useEffect(() => {
    if (!expanded || tasks !== null) return;
    startLoadTasks(async () => {
      const result = await fetchTasksAction(project.id);
      if ("error" in result) setTasksError(result.error);
      else setTasks(result.tasks);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !project.hasAutotaskCompany || quoteLog !== null) return;
    startLoadQuoteLog(async () => {
      const result = await fetchQuoteLogAction(project.id);
      if ("error" in result) setQuoteLogError(result.error);
      else setQuoteLog(result.entries);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!expanded || notes !== null) return;
    startLoadNotes(async () => {
      const result = await fetchNotesAction(project.id);
      if ("error" in result) setNotesError(result.error);
      else setNotes(result.notes);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!expanded || documents !== null) return;
    startLoadDocuments(async () => {
      const result = await fetchDocumentsAction(project.id);
      if ("error" in result) setDocumentsError(result.error);
      else setDocuments(result.documents);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const refreshDocuments = () => {
    startLoadDocuments(async () => {
      const result = await fetchDocumentsAction(project.id);
      if (!("error" in result)) setDocuments(result.documents);
    });
  };

  const refreshTasks = () => {
    startLoadTasks(async () => {
      const result = await fetchTasksAction(project.id);
      if (!("error" in result)) setTasks(result.tasks);
    });
  };

  const refreshQuoteLog = () => {
    startLoadQuoteLog(async () => {
      const result = await fetchQuoteLogAction(project.id);
      if (!("error" in result)) setQuoteLog(result.entries);
    });
  };

  const [noteState, noteFormAction, notePending] = useActionState(addNoteAction, initialNoteState);
  const noteFormRef = useRef<HTMLFormElement>(null);
  const prevNoteState = useRef(noteState);
  useEffect(() => {
    if (prevNoteState.current !== noteState && !noteState.error) {
      noteFormRef.current?.reset();
      startLoadNotes(async () => {
        const result = await fetchNotesAction(project.id);
        if (!("error" in result)) setNotes(result.notes);
      });
    }
    prevNoteState.current = noteState;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteState]);

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_9rem_4rem_5rem_8rem_5rem_6.5rem_1rem] items-center gap-3 px-5 py-2 text-left hover:bg-slate-50"
      >
        <span className="min-w-0 truncate text-sm font-medium text-slate-900">
          {project.name}
        </span>
        <span className="min-w-0 truncate text-sm text-slate-600">{clientName ?? "—"}</span>
        <span className="truncate text-xs text-slate-500" title="Days open">
          {project.daysOpen}d
        </span>
        <span className="truncate text-xs text-slate-500">
          {project.actualHours !== null ? `${formatHours(project.actualHours)} used` : "—"}
        </span>
        <span className="min-w-0">
          <QuotedHoursEditor
            projectId={project.id}
            hours={project.quotedHours}
            action={updateQuotedHoursAction}
          />
        </span>
        <span>{hoursUsage && <Badge value={hoursUsage} />}</span>
        <span>
          <Badge value={project.status} />
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 justify-self-end text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {expanded && (
        <div
          className="space-y-3 border-t border-slate-100 bg-slate-50 px-5 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/projects/${project.id}`} className="text-xs text-slate-500 underline">
            View full project →
          </Link>

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tasks
              </p>
            </div>
            {loadingTasks && tasks === null && (
              <p className="px-3 py-2 text-xs text-slate-500">Loading tasks…</p>
            )}
            {tasksError && <p className="px-3 py-2 text-xs text-red-600">{tasksError}</p>}
            {tasks && tasks.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <p className="min-w-0 truncate text-sm text-slate-900">{t.title}</p>
                    <p className="shrink-0 text-xs text-slate-500">
                      {t.assigneeName ?? "Unassigned"}
                      {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {tasks && tasks.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">No open tasks yet.</p>
            )}
            <ProjectTaskQuickAdd
              clientId={project.client_id}
              projectId={project.id}
              members={members}
              action={async (prevState, formData) => {
                const result = await createTaskAction(prevState, formData);
                if (!result.error) refreshTasks();
                return result;
              }}
            />
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Notes
            </p>
            <div className="space-y-2">
              {loadingNotes && notes === null && (
                <p className="text-xs text-slate-500">Loading notes…</p>
              )}
              {notesError && <p className="text-xs text-red-600">{notesError}</p>}
              {notes && notes.length > 0 && (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="text-sm">
                      <p className="whitespace-pre-line text-slate-700">{n.body}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {n.authorName ?? "Unknown"} · {formatDate(n.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {notes && notes.length === 0 && (
                <p className="text-xs text-slate-500">No notes yet.</p>
              )}
              <form ref={noteFormRef} action={noteFormAction} className="flex items-start gap-2 pt-1">
                <textarea
                  name="body"
                  rows={2}
                  placeholder="Add a note..."
                  required
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={notePending}
                  className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {notePending ? "Adding…" : "Add"}
                </button>
              </form>
              {noteState.error && <p className="text-xs text-red-600">{noteState.error}</p>}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Documents
              </p>
            </div>
            {loadingDocuments && documents === null && (
              <p className="px-3 py-2 text-xs text-slate-500">Loading documents…</p>
            )}
            {documentsError && <p className="px-3 py-2 text-xs text-red-600">{documentsError}</p>}
            {documents && documents.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {doc.subject ?? doc.attachmentFilename ?? "Document"}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(doc.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <a
                        href={`/api/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-brand underline"
                      >
                        View
                      </a>
                      <a
                        href={`/api/documents/${doc.id}?download=1`}
                        className="text-xs font-medium text-slate-600 underline"
                      >
                        Download
                      </a>
                      <DeleteButton
                        action={async () => {
                          await deleteDocumentAction(doc.id);
                          refreshDocuments();
                        }}
                        confirmText={`Remove "${doc.subject ?? doc.attachmentFilename ?? "this document"}"?`}
                        label="Remove"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {documents && documents.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">No documents uploaded yet.</p>
            )}
            <ProjectDocumentUpload
              action={async (prevState, formData) => {
                const result = await uploadDocumentAction(prevState, formData);
                if (!result.error) refreshDocuments();
                return result;
              }}
            />
          </div>

          {project.hasAutotaskCompany && (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Autotask quotes
              </p>

              {loadingQuoteLog && quoteLog === null && (
                <p className="text-xs text-slate-500">Loading logged quotes…</p>
              )}
              {quoteLogError && <p className="text-xs text-red-600">{quoteLogError}</p>}
              {quoteLog && quoteLog.length > 0 && (
                <ul className="mb-3 space-y-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                  {quoteLog.map((entry) => (
                    <li key={entry.id} className="px-3 py-2">
                      <p className="text-sm font-medium text-slate-900">{entry.subject}</p>
                      {entry.body && <p className="text-xs text-slate-500">{entry.body}</p>}
                      {entry.externalLink && (
                        <a
                          href={entry.externalLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-block text-xs text-slate-500 underline"
                        >
                          View in Autotask
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <AutotaskQuotePicker
                listAutotaskQuotesAction={() => listAutotaskQuotesAction(project.client_id)}
                logAutotaskQuoteAction={(quote) =>
                  logAutotaskQuoteAction(project.client_id, project.id, quote)
                }
                onLogged={refreshQuoteLog}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
