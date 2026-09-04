"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
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
  assigneeName,
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
  assigneeName: string | null;
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
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{request.title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[clientName ?? "Internal", assigneeName ?? "Unassigned"].join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge value={request.source} />
          <span className="text-xs text-slate-500">{formatDate(request.created_at)}</span>
          <Badge value={request.stage} />
          <IconChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div
          className="space-y-3 border-t border-slate-100 bg-slate-50 px-5 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <FieldLabel>Title</FieldLabel>
            <InlineTextEdit
              taskId={request.id}
              field="title"
              value={request.title}
              action={updateFieldAction}
              disabled={!canManage}
            />
          </div>
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

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
            <div>
              <FieldLabel>Stage</FieldLabel>
              <InlineSelectEdit
                taskId={request.id}
                field="stage"
                value={request.stage}
                action={updateFieldAction}
                options={stageOptions}
                disabled={!canManage}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Requested by</FieldLabel>
              <InlineTextEdit
                taskId={request.id}
                field="requested_by_name"
                value={request.requested_by_name ?? ""}
                action={updateFieldAction}
                placeholder="Name"
                emptyLabel="Add name"
                disabled={!canManage}
              />
            </div>
            <div>
              <FieldLabel>Their email</FieldLabel>
              <InlineTextEdit
                taskId={request.id}
                field="requested_by_email"
                value={request.requested_by_email ?? ""}
                action={updateFieldAction}
                placeholder="Email"
                emptyLabel="Add email"
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
