"use client";

import { useState, useTransition } from "react";

/** Same click-to-edit/blur-to-save UX as task-field-editor.tsx's
 * InlineTextEdit, as a textarea instead of a single-line input since this is
 * meant to read as a short paragraph, not a category — and with a resume-
 * specific action signature rather than that component's generic
 * (taskId, field, value) one. */
export function FinalDecisionEditor({
  resumeId,
  value,
  action,
}: {
  resumeId: string;
  value: string | null;
  action: (resumeId: string, decision: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [isPending, startTransition] = useTransition();

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== (value ?? "")) {
      startTransition(() => {
        action(resumeId, trimmed || null);
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
        className="w-full whitespace-pre-line rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
      >
        {value || <span className="text-slate-400">Click to record the final decision…</span>}
      </button>
    );
  }

  return (
    <textarea
      autoFocus
      rows={3}
      defaultValue={draft}
      disabled={isPending}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
    />
  );
}
