"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IndeterminateProgressBar } from "@/components/progress-bar";

/** Labeled just "Summary" in the UI (not "AI Summary") — it starts as an AI
 * draft but is meant to be read as staff's own final word on the review,
 * freely editable if they don't like what the AI wrote. Goes to the
 * client email as-is. Uncontrolled textarea keyed on `value` so an AI
 * regeneration (which changes `value` via router.refresh(), not local
 * state) actually shows up — a controlled input wouldn't resync from a
 * prop change like that. */
export function QuarterlyReviewSummary({
  reviewId,
  value,
  disabled,
  saveAction,
  generateAction,
}: {
  reviewId: string;
  value: string | null;
  disabled: boolean;
  saveAction: (reviewId: string, summary: string | null) => Promise<void>;
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
        <p className="text-sm font-semibold text-slate-900">Summary</p>
        {!disabled && (
          <button
            type="button"
            onClick={generate}
            disabled={genPending}
            className="text-xs font-medium text-brand underline disabled:opacity-60"
          >
            {genPending ? "Generating…" : "Generate with AI"}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Goes to the client as part of the review email.</p>
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
        placeholder="Write a short summary for the client, or generate a draft with AI…"
        className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
      {genPending && <IndeterminateProgressBar />}
      {genMessage && (
        <p className={`mt-1 text-xs ${genMessage.error ? "text-red-600" : "text-emerald-600"}`}>{genMessage.text}</p>
      )}
    </div>
  );
}
