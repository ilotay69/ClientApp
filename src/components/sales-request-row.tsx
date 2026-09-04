"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { DeleteButton } from "@/components/delete-button";
import { InlineTextEdit, InlineSelectEdit } from "@/components/task-field-editor";
import { formatDate } from "@/lib/format";
import { IconChevronDown } from "@/components/icons";
import type { FormState, SalesRequestNote } from "@/app/(dashboard)/sales-requests/actions";

const initialNoteState: FormState = { error: null };

export type SalesRequestRowData = {
  id: string;
  title: string;
  detail: string | null;
  stage: string;
  source: string;
  client_id: string | null;
  assigned_to: string | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  created_at: string;
};

export function SalesRequestRow({
  request,
  clientName,
  clientOptions,
  members,
  canManage,
  stageOptions,
  updateFieldAction,
  deleteAction,
  fetchNotesAction,
  addNoteAction,
}: {
  request: SalesRequestRowData;
  clientName: string | null;
  clientOptions: { value: string; label: string }[];
  members: { id: string; full_name: string }[];
  canManage: boolean;
  stageOptions: { value: string; label: string }[];
  updateFieldAction: (requestId: string, field: string, value: string) => Promise<void>;
  deleteAction: () => Promise<void>;
  fetchNotesAction: (requestId: string) => Promise<{ notes: SalesRequestNote[] } | { error: string }>;
  addNoteAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [expanded, setExpanded] = useState(false);
  const assigneeOptions = [{ value: "", label: "Unassigned" }].concat(
    members.map((m) => ({ value: m.id, label: m.full_name }))
  );

  const [notes, setNotes] = useState<SalesRequestNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [loadingNotes, startLoadNotes] = useTransition();

  useEffect(() => {
    if (!expanded || notes !== null) return;
    startLoadNotes(async () => {
      const result = await fetchNotesAction(request.id);
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
        const result = await fetchNotesAction(request.id);
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
        <span className="w-24 shrink-0 text-xs text-slate-500">{formatDate(request.created_at)}</span>
        <span className="w-32 shrink-0 truncate text-sm text-slate-700">{clientName ?? "Internal"}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
          {request.title}
        </span>
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <InlineSelectEdit
            taskId={request.id}
            field="stage"
            value={request.stage}
            action={updateFieldAction}
            options={stageOptions}
            disabled={!canManage}
          />
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
            <FieldLabel>Detail</FieldLabel>
            <InlineTextEdit
              taskId={request.id}
              field="detail"
              value={request.detail ?? ""}
              action={updateFieldAction}
              placeholder="Add detail..."
              emptyLabel="Add detail"
              disabled={!canManage}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel>Client</FieldLabel>
              <InlineSelectEdit
                taskId={request.id}
                field="client_id"
                value={request.client_id ?? ""}
                action={updateFieldAction}
                options={clientOptions}
                disabled={!canManage}
              />
            </div>
            <div>
              <FieldLabel>Assigned to</FieldLabel>
              <InlineSelectEdit
                taskId={request.id}
                field="assigned_to"
                value={request.assigned_to ?? ""}
                action={updateFieldAction}
                options={assigneeOptions}
                disabled={!canManage}
              />
            </div>
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

          {canManage && (
            <div className="flex justify-end">
              <DeleteButton
                action={deleteAction}
                confirmText={`Delete "${request.title}"?`}
                label="Delete"
              />
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
