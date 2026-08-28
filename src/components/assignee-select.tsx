"use client";

import { useTransition } from "react";

export function AssigneeSelect({
  id,
  currentAssignee,
  members,
  action,
  disabled,
}: {
  id: string;
  currentAssignee: string | null;
  members: { id: string; full_name: string }[];
  action: (id: string, assignedTo: string | null) => Promise<void>;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={currentAssignee ?? ""}
      disabled={disabled || isPending}
      onChange={(e) => {
        const value = e.target.value || null;
        startTransition(() => {
          action(id, value);
        });
      }}
      className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.full_name}
        </option>
      ))}
    </select>
  );
}
