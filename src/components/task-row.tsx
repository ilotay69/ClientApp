"use client";

import { useState } from "react";
import { Badge, OverdueBadge } from "@/components/badge";
import { DeleteButton } from "@/components/delete-button";
import { TaskAssigneesSelect } from "@/components/task-assignees-select";
import { InlineTextEdit, InlineDateEdit, InlineSelectEdit } from "@/components/task-field-editor";
import { formatDate, isOverdue } from "@/lib/format";
import { IconChevronDown } from "@/components/icons";

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
  projectLabel,
  assigneeIds,
  assigneeNames,
  clientOptions,
  projectOptions,
  members,
  canDelete,
  statusOptions,
  priorityOptions,
  updateFieldAction,
  setAssigneesAction,
  deleteAction,
}: {
  task: TaskRowData;
  clientName: string | null;
  projectLabel: string | null;
  assigneeIds: string[];
  assigneeNames: string;
  clientOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  members: { id: string; full_name: string }[];
  canDelete: boolean;
  statusOptions: { value: string; label: string }[];
  priorityOptions: { value: string; label: string }[];
  updateFieldAction: (taskId: string, field: string, value: string) => Promise<void>;
  setAssigneesAction: (id: string, assigneeIds: string[]) => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = task.status !== "done" && task.status !== "dismissed" && isOverdue(task.due_date);

  const metaParts = task.is_personal
    ? []
    : [clientName, projectLabel, assigneeNames || "Unassigned"].filter((p): p is string => Boolean(p));

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {!task.is_personal && <Badge value={task.kind} />}
            <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
          </div>
          {metaParts.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{metaParts.join(" · ")}</p>
          )}
          {task.is_personal && task.detail && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{task.detail}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {task.priority === "high" && <Badge value="high" />}
          {task.due_date && (
            <span className="text-xs text-slate-500">{formatDate(task.due_date)}</span>
          )}
          {overdue && <OverdueBadge />}
          <Badge value={task.status} />
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
            <InlineTextEdit taskId={task.id} field="title" value={task.title} action={updateFieldAction} />
          </div>
          <div>
            <FieldLabel>Detail</FieldLabel>
            <InlineTextEdit
              taskId={task.id}
              field="detail"
              value={task.detail ?? ""}
              action={updateFieldAction}
              placeholder="Add detail..."
              emptyLabel="Add detail"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {!task.is_personal && (
              <div>
                <FieldLabel>Client</FieldLabel>
                <InlineSelectEdit
                  taskId={task.id}
                  field="client_id"
                  value={task.client_id ?? ""}
                  action={updateFieldAction}
                  options={clientOptions}
                />
              </div>
            )}
            {!task.is_personal && (
              <div>
                <FieldLabel>Project</FieldLabel>
                <InlineSelectEdit
                  taskId={task.id}
                  field="project_id"
                  value={task.project_id ?? ""}
                  action={updateFieldAction}
                  options={projectOptions}
                />
              </div>
            )}
            {!task.is_personal && (
              <div>
                <FieldLabel>Assigned to</FieldLabel>
                <TaskAssigneesSelect
                  id={task.id}
                  currentAssigneeIds={assigneeIds}
                  members={members}
                  action={setAssigneesAction}
                />
              </div>
            )}
            <div>
              <FieldLabel>Priority</FieldLabel>
              <InlineSelectEdit
                taskId={task.id}
                field="priority"
                value={task.priority}
                action={updateFieldAction}
                options={priorityOptions}
              />
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <InlineSelectEdit
                taskId={task.id}
                field="status"
                value={task.status}
                action={updateFieldAction}
                options={statusOptions}
              />
            </div>
            <div>
              <FieldLabel>Start</FieldLabel>
              <InlineDateEdit
                taskId={task.id}
                field="start_date"
                value={task.start_date ?? ""}
                action={updateFieldAction}
              />
            </div>
            <div>
              <FieldLabel>Due</FieldLabel>
              <InlineDateEdit
                taskId={task.id}
                field="due_date"
                value={task.due_date ?? ""}
                action={updateFieldAction}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Notes</FieldLabel>
            <InlineTextEdit
              taskId={task.id}
              field="notes"
              value={task.notes ?? ""}
              action={updateFieldAction}
              placeholder="Add notes..."
              emptyLabel="Add notes"
            />
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
