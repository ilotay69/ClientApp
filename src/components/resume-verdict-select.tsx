"use client";

import { useTransition } from "react";
import type { ResumeVerdict } from "@/lib/types";

const OPTIONS: { value: ResumeVerdict | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

/** Same inline-edit shape as resume-status-select.tsx, for staff's own
 * verdict — independent of ai_verdict, so this needs an "unset" option
 * (blank) that AI verdict never does, since a status always has a value but
 * a human call may simply not have been made yet. */
export function ResumeVerdictSelect({
  resumeId,
  value,
  action,
}: {
  resumeId: string;
  value: ResumeVerdict | null;
  action: (id: string, verdict: ResumeVerdict | null) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      defaultValue={value ?? ""}
      disabled={isPending}
      onChange={(e) =>
        startTransition(() => action(resumeId, (e.target.value || null) as ResumeVerdict | null))
      }
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
