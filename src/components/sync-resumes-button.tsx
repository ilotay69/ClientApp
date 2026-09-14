"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IndeterminateProgressBar } from "@/components/progress-bar";

/** Modeled on sync-mailbox-button.tsx's action-prop shape rather than
 * sync-mail-button.tsx's useActionState-with-a-hardcoded-import shape — both
 * of this file's actions (syncResumesNow, screenPendingResumesAction) take
 * zero arguments and read the caller's own session, so a plain useTransition
 * is simpler and doesn't need a FormData plumbing path that goes unused.
 * One generic button covers both; only the label/pending-label differ.
 * `redirectTo` is optional — when set, a successful result navigates there
 * instead of staying put (used for quarterly reviews' "Submit for Review",
 * not for e.g. "Reopen for editing", where staying on the page is the
 * point). */
export function AsyncActionButton({
  label,
  pendingLabel,
  action,
  redirectTo,
}: {
  label: string;
  pendingLabel: string;
  action: () => Promise<{ ok: boolean; message: string }>;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok && redirectTo) router.push(redirectTo);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? pendingLabel : label}
      </button>
      {pending && <IndeterminateProgressBar />}
      {result && (
        <span className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</span>
      )}
    </div>
  );
}
