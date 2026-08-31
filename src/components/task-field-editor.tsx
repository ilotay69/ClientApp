"use client";

import { useState, useTransition } from "react";

type BaseProps = {
  taskId: string;
  field: string;
  value: string;
  action: (taskId: string, field: string, value: string) => Promise<void>;
  disabled?: boolean;
};

function commit(
  action: BaseProps["action"],
  taskId: string,
  field: string,
  value: string,
  startTransition: (fn: () => void) => void
) {
  startTransition(() => {
    action(taskId, field, value);
  });
}

export function InlineTextEdit({
  taskId,
  field,
  value,
  action,
  disabled,
  placeholder,
  emptyLabel = "—",
}: BaseProps & { placeholder?: string; emptyLabel?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="w-full rounded px-1 py-0.5 text-left hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent"
      >
        {value || <span className="text-slate-400">{emptyLabel}</span>}
      </button>
    );
  }

  return (
    <input
      autoFocus
      defaultValue={draft}
      disabled={isPending}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) commit(action, taskId, field, draft, startTransition);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-full rounded-md border border-slate-300 px-1.5 py-0.5 text-sm"
    />
  );
}

export function InlineDateEdit({ taskId, field, value, action, disabled }: BaseProps) {
  const [isPending, startTransition] = useTransition();
  return (
    <input
      type="date"
      defaultValue={value}
      disabled={disabled || isPending}
      onChange={(e) => commit(action, taskId, field, e.target.value, startTransition)}
      className="rounded-md border border-slate-300 px-1.5 py-0.5 text-sm disabled:opacity-60"
    />
  );
}

export function InlineSelectEdit({
  taskId,
  field,
  value,
  action,
  disabled,
  options,
}: BaseProps & { options: { value: string; label: string }[] }) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      defaultValue={value}
      disabled={disabled || isPending}
      onChange={(e) => commit(action, taskId, field, e.target.value, startTransition)}
      className="rounded-md border border-slate-300 px-1.5 py-0.5 text-sm disabled:opacity-60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
