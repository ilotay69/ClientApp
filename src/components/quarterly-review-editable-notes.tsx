"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IndeterminateProgressBar } from "@/components/progress-bar";

/** Generic "generate a starting point from the checklist, then edit
 * freely" field — same pattern as QuarterlyReviewSummary, reused for both
 * Action Items and Changes Since Last Review so there's one component
 * instead of two near-identical copies. Uncontrolled textarea keyed on
 * `value` so a Generate click (which changes `value` via router.refresh(),
 * not local state) actually shows up. */
export function QuarterlyReviewEditableNotes({
  reviewId,
  title,
  subtitle,
  placeholder,
  generateLabel,
  value,
  disabled,
  saveAction,
  generateAction,
}: {
  reviewId: string;
  title: string;
  subtitle: string;
  placeholder: string;
  generateLabel: string;
  value: string | null;
  disabled: boolean;
  saveAction: (reviewId: string, notes: string | null) => Promise<void>;
  generateAction: (reviewId: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [savePending, startSaveTransition] = useTransition();
  const [genPending, startGenTransition] = useTransition();
  const [genMessage, setGenMessage] = useState<{ error: boolean; text: string } | null>(null);

  function generate() {
    setGenMessage(null);
    startGenTransition(async () => {
      const result = await generateAction(reviewId);
      setGenMessage({ error: !result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {!disabled && (
          <button
            type="button"
            onClick={generate}
            disabled={genPending}
            className="text-xs font-medium text-brand underline disabled:opacity-60"
          >
            {genPending ? "Generating…" : generateLabel}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      <textarea
        key={value ?? ""}
        defaultValue={value ?? ""}
        disabled={disabled || savePending || genPending}
        onBlur={(e) => {
          const trimmed = e.target.value.trim();
          if (trimmed !== (value ?? "")) {
            startSaveTransition(() => saveAction(reviewId, trimmed || null));
          }
        }}
        rows={4}
        placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
      {genPending && <IndeterminateProgressBar />}
      {genMessage && (
        <p className={`mt-1 text-xs ${genMessage.error ? "text-red-600" : "text-emerald-600"}`}>{genMessage.text}</p>
      )}
    </div>
  );
}
