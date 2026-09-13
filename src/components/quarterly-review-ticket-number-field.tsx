"use client";

import { useTransition } from "react";

/** Always editable regardless of review status, same as
 * QuarterlyReviewHoursField — internal reference only, never included in
 * the client email or PDF. */
export function QuarterlyReviewTicketNumberField({
  reviewId,
  value,
  action,
}: {
  reviewId: string;
  value: string | null;
  action: (reviewId: string, ticketNumber: string | null) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-slate-700">Ticket #</label>
      <input
        key={value ?? ""}
        type="text"
        defaultValue={value ?? ""}
        disabled={pending}
        onBlur={(e) => {
          const next = e.target.value.trim() || null;
          if (next !== value) {
            startTransition(() => action(reviewId, next));
          }
        }}
        placeholder="Autotask ticket"
        className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}
