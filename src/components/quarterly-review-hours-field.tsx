"use client";

import { useTransition } from "react";

/** Always editable regardless of review status — internal time tracking,
 * never included in the client email (buildQuarterlyReviewClientEmail has
 * no parameter for it at all, so there's no path that could leak it). */
export function QuarterlyReviewHoursField({
  reviewId,
  value,
  action,
}: {
  reviewId: string;
  value: number | null;
  action: (reviewId: string, hours: number | null) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-slate-700">Hours spent</label>
      <input
        key={value ?? ""}
        type="number"
        min={0}
        step={0.25}
        defaultValue={value ?? ""}
        disabled={pending}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const next = raw === "" ? null : Number(raw);
          if (next !== value) {
            startTransition(() => action(reviewId, next));
          }
        }}
        placeholder="0"
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
