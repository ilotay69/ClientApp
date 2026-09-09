"use client";

import { useState, useTransition } from "react";

/** Modeled on sync-mailbox-button.tsx's action-prop shape rather than
 * sync-mail-button.tsx's useActionState-with-a-hardcoded-import shape — both
 * of this file's actions (syncResumesNow, screenPendingResumesAction) take
 * zero arguments and read the caller's own session, so a plain useTransition
 * is simpler and doesn't need a FormData plumbing path that goes unused.
 * One generic button covers both; only the label/pending-label differ. */
export function AsyncActionButton({
  label,
  pendingLabel,
  action,
}: {
  label: string;
  pendingLabel: string;
  action: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setResult(null);
    startTransition(async () => {
      setResult(await action());
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
      {result && (
        <span className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</span>
      )}
    </div>
  );
}
