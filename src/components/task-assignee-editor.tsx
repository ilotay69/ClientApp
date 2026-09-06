"use client";

import { useState, useTransition } from "react";

/** Checkbox list, same shape as TaskQuickAdd's assignee picker — each
 * toggle saves immediately (replace-the-whole-set), matching the
 * auto-save-on-change behavior of the other inline task field editors. */
export function TaskAssigneeEditor({
  taskId,
  members,
  initialAssigneeIds,
  action,
}: {
  taskId: string;
  members: { id: string; full_name: string }[];
  initialAssigneeIds: string[];
  action: (taskId: string, assigneeIds: string[]) => Promise<void>;
}) {
  const [assigneeIds, setAssigneeIds] = useState(initialAssigneeIds);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...assigneeIds, id] : assigneeIds.filter((a) => a !== id);
    setAssigneeIds(next);
    startTransition(async () => {
      await action(taskId, next);
    });
  };

  if (members.length === 0) {
    return <p className="text-xs text-slate-500">No team members to assign.</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-white p-2">
      {members.map((m) => (
        <label
          key={m.id}
          className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm hover:bg-slate-50 ${
            pending ? "opacity-60" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={assigneeIds.includes(m.id)}
            disabled={pending}
            onChange={(e) => toggle(m.id, e.target.checked)}
            className="rounded border-slate-300"
          />
          {m.full_name}
        </label>
      ))}
    </div>
  );
}
