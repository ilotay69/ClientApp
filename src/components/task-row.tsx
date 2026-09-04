"use client";

import { useState } from "react";
import { Badge, OverdueBadge } from "@/components/badge";
import { DeleteButton } from "@/components/delete-button";
import { InlineTextEdit, InlineSelectEdit } from "@/components/task-field-editor";
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
  assigneeNames,
  canDelete,
  statusOptions,
  updateFieldAction,
  deleteAction,
}: {
  task: TaskRowData;
  clientName: string | null;
  assigneeNames: string;
  canDelete: boolean;
  statusOptions: { value: string; label: string }[];
  updateFieldAction: (taskId: string, field: string, value: string) => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = task.status !== "done" && task.status !== "dismissed" && isOverdue(task.due_date);
  const clientLabel = task.is_personal ? "Personal" : (clientName ?? "Internal");
  const personLabel = task.is_personal ? "You" : assigneeNames || "Unassigned";

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
            <FieldLabel>Description</FieldLabel>
            <InlineTextEdit
              taskId={task.id}
              field="notes"
              value={task.notes ?? ""}
              action={updateFieldAction}
              placeholder="Add description..."
              emptyLabel="Add description"
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
