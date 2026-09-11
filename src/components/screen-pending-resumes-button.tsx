"use client";

import { useState, useTransition } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";
import type { ResumeScreenState } from "@/app/(dashboard)/recruitment/actions";

// Safety cap on loop iterations — well above any realistic pending queue at
// PENDING_SCREEN_LIMIT (5) per call — so a stuck action (remaining somehow
// never reaching 0) can't spin forever.
const MAX_ITERATIONS = 60;

/** screenPendingResumesAction only screens a handful of resumes per call
 * (see PENDING_SCREEN_LIMIT in resume-screening.ts) — a single call used to
 * process up to 50 in one request, which could run long enough to outlive
 * Railway's own request timeout with many pending resumes, surfacing as a
 * generic "This page couldn't load" the app never gets a chance to display
 * anything useful for. This button calls the action repeatedly instead,
 * accumulating totals across calls and stopping once the server reports no
 * pending resumes left — same end result (everything gets screened) as a
 * sequence of short, safe requests rather than one long one. */
export function ScreenPendingResumesButton({
  action,
}: {
  action: () => Promise<ResumeScreenState>;
}) {
  const [pending, startTransition] = useTransition();
  const [totals, setTotals] = useState<{ screened: number; errored: number; remaining: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  function run() {
    setTotals(null);
    setError(null);
    startTransition(async () => {
      let screened = 0;
      let errored = 0;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const result = await action();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        screened += result.screened ?? 0;
        errored += result.errored ?? 0;
        const remaining = result.remaining ?? 0;
        setTotals({ screened, errored, remaining });
        // A call that screened and errored nothing yet still reports
        // pending work would loop forever — stop rather than spin.
        if (remaining <= 0 || ((result.screened ?? 0) === 0 && (result.errored ?? 0) === 0)) {
          return;
        }
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Screening…" : "Screen pending resumes"}
      </button>
      {pending && <IndeterminateProgressBar />}
      {totals && (
        <span className="text-sm text-emerald-700">
          Screened {totals.screened}, {totals.errored} error{totals.errored === 1 ? "" : "s"}
          {totals.remaining > 0 ? ` — ${totals.remaining} remaining…` : "."}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
