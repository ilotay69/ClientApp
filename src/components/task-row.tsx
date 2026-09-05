"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Badge, OverdueBadge } from "@/components/badge";
import { DeleteButton } from "@/components/delete-button";
import { InlineTextEdit, InlineSelectEdit } from "@/components/task-field-editor";
import { formatDate, isOverdue } from "@/lib/format";
import { IconChevronDown } from "@/components/icons";
import type { FormState, TaskNote } from "@/app/(dashboard)/tasks/actions";

const initialNoteState: FormState = { error: null };

export type TaskRowData = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  notes: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  client_id: string | null;
  project_id: string | null;
  is_personal: boolean;
};

// Every field used to render as a permanently-visible input/select in every
// row at once — nine form controls per row, all the time, regardless of
// whether anyone was about to edit anything. That's what made the list hard
// to read. Now a row is plain text until clicked; editing (still the same
// click-a-field-to-edit / auto-save-on-change components as before) only
// happens inside the expanded panel.
export function TaskRow({
  task,
  clientName,
  assigneeNames,
  canDelete,
  statusOptions,
  updateFieldAction,
  deleteAction,
  fetchNotesAction,
  addNoteAction,
}: {
  task: TaskRowData;
  clientName: string | null;
  assigneeNames: string;
  canDelete: boolean;
  statusOptions: { value: string; label: string }[];
  updateFieldAction: (taskId: string, field: string, value: string) => Promise<void>;
  deleteAction: () => Promise<void>;
  fetchNotesAction: (taskId: string) => Promise<{ notes: TaskNote[] } | { error: string }>;
  addNoteAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = task.status !== "done" && task.status !== "dismissed" && isOverdue(task.due_date);
  const clientLabel = clientName ?? (task.is_personal ? "—" : "Internal");
  const personLabel = task.is_personal ? "" : assigneeNames || "Unassigned";

  const [notes, setNotes] = useState<TaskNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [loadingNotes, startLoadNotes] = useTransition();

  useEffect(() => {
    if (!expanded || notes !== null) return;
    startLoadNotes(async () => {
      const result = await fetchNotesAction(task.id);
      if ("error" in result) setNotesError(result.error);
      else setNotes(result.notes);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const [noteState, noteFormAction, notePending] = useActionState(addNoteAction, initialNoteState);
  const noteFormRef = useRef<HTMLFormElement>(null);
  const prevNoteState = useRef(noteState);
  useEffect(() => {
    if (prevNoteState.current !== noteState && !noteState.error) {
      noteFormRef.current?.reset();
      // Refresh the note list after a successful add.
      startLoadNotes(async () => {
        const result = await fetchNotesAction(task.id);
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
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
      >
        <span className="w-24 shrink-0 text-xs text-slate-500">
          {task.due_date ? formatDate(task.due_date) : "—"}
        </span>
        <span className="w-32 shrink-0 truncate text-sm text-slate-700">{clientLabel}</span>
        <span className="w-32 shrink-0 truncate text-sm text-slate-700">{personLabel}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
          {task.title}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {overdue && <OverdueBadge />}
          {task.priority === "high" && <Badge value="high" />}
          <span onClick={(e) => e.stopPropagation()}>
            <InlineSelectEdit
              taskId={task.id}
              field="status"
              value={task.status}
              action={updateFieldAction}
              options={statusOptions}
            />
          </span>
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {expanded && (
        <div
          className="space-y-3 border-t border-slate-100 bg-slate-50 px-5 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <InlineTextEdit taskId={task.id} field="title" value={task.title} action={updateFieldAction} />
          </div>

          <div>
            <FieldLabel>Notes</FieldLabel>
            <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
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

          {canDelete && (
            <div className="flex justify-end">
              <DeleteButton action={deleteAction} confirmText={`Delete "${task.title}"?`} label="Delete" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</p>
  );
}
