"use client";

import { useState, useTransition } from "react";
import { QUARTERLY_REVIEW_EXTRA_SECTIONS, type QuarterlyReviewExtraSectionKey } from "@/lib/quarterly-review-sections";

/** Which optional data sections (Device Health, 365 Licenses, ...) get
 * inserted into this review's PDF beyond the fixed checklist — toggles
 * save immediately, same as the hours/ticket fields elsewhere on this
 * page. Always editable regardless of review status, since it only
 * affects what the PDF includes, not the reviewed checklist itself. */
export function QuarterlyReviewExtraSectionsField({
  reviewId,
  value,
  action,
}: {
  reviewId: string;
  value: string[];
  action: (reviewId: string, sections: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(value);
  const [pending, startTransition] = useTransition();

  function toggle(key: QuarterlyReviewExtraSectionKey) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    setSelected(next);
    startTransition(() => action(reviewId, next));
  }

  return (
    <div>
      <p className="text-xs font-medium text-slate-700">Also include in PDF</p>
      <div className="mt-1 flex flex-wrap gap-3">
        {QUARTERLY_REVIEW_EXTRA_SECTIONS.map((s) => (
          <label
            key={s.key}
            title={s.description}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700"
          >
            <input
              type="checkbox"
              checked={selected.includes(s.key)}
              disabled={pending}
              onChange={() => toggle(s.key)}
            />
            {s.label}
          </label>
        ))}
      </div>
    </div>
  );
}
