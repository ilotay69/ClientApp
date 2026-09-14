"use client";

import { useState, useTransition } from "react";
import {
  QUARTERLY_STATUS_LABELS,
  QUARTERLY_STATUS_ORDER,
  type QuarterlyReviewItemStatus,
} from "@/lib/quarterly-review-sections";
import { IconCheck, IconFlag, IconAlertTriangle, IconX } from "@/components/icons";

const ACTIVE_CLASSES: Record<QuarterlyReviewItemStatus, string> = {
  na: "border-slate-400 bg-slate-100 text-slate-700",
  healthy: "border-emerald-400 bg-emerald-50 text-emerald-700",
  recommended: "border-indigo-400 bg-indigo-50 text-indigo-700",
  attention: "border-amber-400 bg-amber-50 text-amber-700",
  urgent: "border-red-400 bg-red-50 text-red-700",
};

const STATUS_ICONS: Record<QuarterlyReviewItemStatus, (props: { className?: string }) => React.ReactNode> = {
  na: IconX,
  healthy: IconCheck,
  recommended: IconFlag,
  attention: IconAlertTriangle,
  urgent: IconAlertTriangle,
};

/** One review line item — a quick-pick button per status (N/A / Healthy /
 * Recommended / Need Attention / Need Urgent Attention) instead of a
 * dropdown, so filling out ~46 items doesn't mean opening a select each
 * time, plus a comments field. Status saves immediately on click;
 * comments save on blur. `index` is just this item's 1-based position
 * within its section, for the small numbered badge. */
export function QuarterlyReviewItemRow({
  reviewId,
  itemKey,
  label,
  status,
  comments,
  disabled,
  action,
  index,
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
  index?: number;
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
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {typeof index === "number" && (
            <span className="mt-0.5 shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
              {String(index).padStart(2, "0")}
            </span>
          )}
          <p className="min-w-0 text-sm font-medium text-slate-900">{label}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {QUARTERLY_STATUS_ORDER.map((value) => {
            const Icon = STATUS_ICONS[value];
            const isActive = currentStatus === value;
            return (
              <button
                key={value}
                type="button"
                disabled={isDisabled}
                onClick={() => saveStatus(value)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60 ${
                  isActive ? ACTIVE_CLASSES[value] : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {QUARTERLY_STATUS_LABELS[value]}
              </button>
            );
          })}
        </div>
      </div>
      <textarea
        defaultValue={draftComments}
        onChange={(e) => setDraftComments(e.target.value)}
        onBlur={saveComments}
        disabled={isDisabled}
        rows={2}
        placeholder="Comments…"
        className="mt-2.5 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
