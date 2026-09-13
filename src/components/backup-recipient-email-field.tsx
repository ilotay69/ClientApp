"use client";

import { useState, useTransition } from "react";

/** Click-to-edit/blur-to-save, same UX as final-decision-editor.tsx — a
 * single-line input here since this is just an email address, not a
 * paragraph. */
export function BackupRecipientEmailField({
  value,
  action,
}: {
  value: string | null;
  action: (email: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== (value ?? "")) {
      startTransition(() => {
        action(trimmed || null);
      });
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
        className="rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
      >
        {value || <span className="text-slate-400">Click to set the recipient email…</span>}
      </button>
    );
  }

  return (
    <input
      type="email"
      autoFocus
      defaultValue={draft}
      disabled={isPending}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      placeholder="ops@cgtechnologies.com"
      className="w-72 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
    />
  );
}
