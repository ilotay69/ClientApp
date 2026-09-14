"use client";

import { useState, useTransition } from "react";
import type { ResumeStatus } from "@/lib/types";

const OPTIONS: { value: ResumeStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "contacting", label: "Contacting" },
  { value: "invited", label: "Invited" },
  { value: "interviewing", label: "Interviewing" },
  { value: "second_interview", label: "2nd Interview" },
  { value: "both_done", label: "Both Done" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
];

/** Same inline-edit shape as task-field-editor.tsx's InlineSelectEdit, just
 * without that component's taskId/field params — a resume only ever has one
 * editable field, so they'd be pure noise here.
 *
 * Controlled (not defaultValue-uncontrolled like InlineSelectEdit) so a
 * failed save can actually revert the dropdown back to the real value —
 * this is what a candidate stuck showing a status that never actually
 * saved looks like otherwise. */
export function ResumeStatusSelect({
  resumeId,
  value,
  action,
}: {
  resumeId: string;
  value: ResumeStatus;
  action: (id: string, status: ResumeStatus) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [selected, setSelected] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: ResumeStatus) {
    const previous = selected;
    setSelected(next);
    setError(null);
    startTransition(async () => {
      const result = await action(resumeId, next);
      if (!result.ok) {
        setSelected(previous);
        setError(result.error ?? "Couldn't save — try again.");
      }
    });
  }

  return (
    <div>
      <select
        value={selected}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value as ResumeStatus)}
        className="rounded-md border border-slate-300 px-1.5 py-0.5 text-sm disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 max-w-[12rem] text-xs text-red-600">{error}</p>}
    </div>
  );
}
