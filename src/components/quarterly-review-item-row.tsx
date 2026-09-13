"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { QUARTERLY_STATUS_LABELS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";

/** One review line item — status select (Healthy/Need Attention/Need
 * Urgent Attention/N/A, matching the original document's own legend) plus
 * a comments field. Status saves immediately; comments save on blur. */
export function QuarterlyReviewItemRow({
  reviewId,
  itemKey,
  label,
  status,
  comments,
  disabled,
  action,
}: {
  reviewId: string;
  itemKey: string;
  label: string;
  status: QuarterlyReviewItemStatus;
  comments: string | null;
  disabled: boolean;
  action: (
    reviewId: string,
    itemKey: string,
    status: QuarterlyReviewItemStatus,
    comments: string | null
  ) => Promise<void>;
}) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [draftComments, setDraftComments] = useState(comments ?? "");
  const [pending, startTransition] = useTransition();

  function saveStatus(next: QuarterlyReviewItemStatus) {
    setCurrentStatus(next);
    startTransition(() => action(reviewId, itemKey, next, draftComments || null));
  }

  function saveComments() {
    startTransition(() => action(reviewId, itemKey, currentStatus, draftComments || null));
  }

  const isDisabled = disabled || pending;

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-slate-900">{label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge value={currentStatus} />
          <select
            value={currentStatus}
            disabled={isDisabled}
            onChange={(e) => saveStatus(e.target.value as QuarterlyReviewItemStatus)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none disabled:opacity-60"
          >
            {(Object.entries(QUARTERLY_STATUS_LABELS) as [QuarterlyReviewItemStatus, string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
        </div>
      </div>
      <textarea
        defaultValue={draftComments}
        onChange={(e) => setDraftComments(e.target.value)}
        onBlur={saveComments}
        disabled={isDisabled}
        rows={2}
        placeholder="Comments…"
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
