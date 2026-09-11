"use client";

import { useTransition } from "react";
import type { ResumeStatus } from "@/lib/types";

const OPTIONS: { value: ResumeStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "contacting", label: "Contacting" },
  { value: "invited", label: "Invited" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
];

/** Same inline-edit shape as task-field-editor.tsx's InlineSelectEdit, just
 * without that component's taskId/field params — a resume only ever has one
 * editable field, so they'd be pure noise here. */
export function ResumeStatusSelect({
  resumeId,
  value,
  action,
}: {
  resumeId: string;
  value: ResumeStatus;
  action: (id: string, status: ResumeStatus) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      defaultValue={value}
      disabled={isPending}
      onChange={(e) => startTransition(() => action(resumeId, e.target.value as ResumeStatus))}
      className="rounded-md border border-slate-300 px-1.5 py-0.5 text-sm disabled:opacity-60"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
