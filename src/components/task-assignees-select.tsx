"use client";

import { useState, useTransition } from "react";

export function TaskAssigneesSelect({
  id,
  currentAssigneeIds,
  members,
  action,
  disabled,
}: {
  id: string;
  currentAssigneeIds: string[];
  members: { id: string; full_name: string }[];
  action: (id: string, assigneeIds: string[]) => Promise<void>;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(currentAssigneeIds);
  const [isPending, startTransition] = useTransition();

  function toggle(memberId: string) {
    const next = selected.includes(memberId)
      ? selected.filter((m) => m !== memberId)
      : [...selected, memberId];
    setSelected(next);
    startTransition(() => {
      action(id, next);
    });
  }

  const label =
    selected.length === 0
      ? "Unassigned"
      : selected
          .map((sid) => members.find((m) => m.id === sid)?.full_name ?? "Unknown")
          .join(", ");

  return (
    <details className="relative">
      <summary
        className={`list-none rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 ${
          disabled || isPending ? "opacity-60" : "cursor-pointer"
        }`}
      >
        {label}
      </summary>
      <div className="absolute z-10 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
        {members.length === 0 && (
          <p className="px-2 py-1 text-xs text-slate-500">No team members yet.</p>
        )}
        {members.map((m) => (
          <label
            key={m.id}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              disabled={disabled || isPending}
              onChange={() => toggle(m.id)}
              className="rounded border-slate-300"
            />
            {m.full_name}
          </label>
        ))}
      </div>
    </details>
  );
}
