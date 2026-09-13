"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import type { BackupItemStatus } from "@/lib/backup-report-sections";

/** One checklist section — a status select (labeled per-section, "Checked"
 * vs "Success", matching the original spreadsheet) plus a notes textarea.
 * Status saves immediately on change; notes save on blur, not per
 * keystroke. */
export function BackupChecklistItem({
  reportId,
  sectionKey,
  label,
  instructions,
  okLabel,
  status,
  notes,
  action,
}: {
  reportId: string;
  sectionKey: string;
  label: string;
  instructions: string;
  okLabel: string;
  status: BackupItemStatus;
  notes: string | null;
  action: (
    reportId: string,
    sectionKey: string,
    status: BackupItemStatus,
    notes: string | null
  ) => Promise<void>;
}) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  function saveStatus(next: BackupItemStatus) {
    setCurrentStatus(next);
    startTransition(() => action(reportId, sectionKey, next, draftNotes || null));
  }

  function saveNotes() {
    startTransition(() => action(reportId, sectionKey, currentStatus, draftNotes || null));
  }

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {instructions && <p className="mt-0.5 text-xs text-slate-500">{instructions}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge value={currentStatus} label={currentStatus === "ok" ? okLabel : undefined} />
          <select
            value={currentStatus}
            disabled={pending}
            onChange={(e) => saveStatus(e.target.value as BackupItemStatus)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none disabled:opacity-60"
          >
            <option value="pending">Not checked</option>
            <option value="ok">{okLabel}</option>
            <option value="issue">Issue</option>
            <option value="na">N/A</option>
          </select>
        </div>
      </div>
      <textarea
        defaultValue={draftNotes}
        onChange={(e) => setDraftNotes(e.target.value)}
        onBlur={saveNotes}
        disabled={pending}
        rows={2}
        placeholder="Notes…"
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
