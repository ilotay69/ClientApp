"use client";

import { useState, useTransition } from "react";
import {
  QUARTERLY_STATUS_LABELS,
  QUARTERLY_STATUS_ORDER,
  type QuarterlyReviewItemStatus,
} from "@/lib/quarterly-review-sections";

const ACTIVE_CLASSES: Record<QuarterlyReviewItemStatus, string> = {
  na: "bg-slate-600 text-white border-slate-600",
  healthy: "bg-emerald-600 text-white border-emerald-600",
  recommended: "bg-indigo-600 text-white border-indigo-600",
  attention: "bg-amber-500 text-white border-amber-500",
  urgent: "bg-red-600 text-white border-red-600",
};

/** One review line item — a quick-pick button per status (N/A / Healthy /
 * Recommended / Need Attention / Need Urgent Attention) instead of a
 * dropdown, so filling out ~46 items doesn't mean opening a select each
 * time, plus a comments field. Status saves immediately on click;
 * comments save on blur. */
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
        <div className="flex shrink-0 flex-wrap gap-1">
          {QUARTERLY_STATUS_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              disabled={isDisabled}
              onClick={() => saveStatus(value)}
              className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60 ${
                currentStatus === value
                  ? ACTIVE_CLASSES[value]
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {QUARTERLY_STATUS_LABELS[value]}
            </button>
          ))}
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
