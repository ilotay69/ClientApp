"use client";

import { useState, useTransition } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";

export function SyncMailboxButton({
  action,
}: {
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
        {pending ? "Syncing…" : "Sync my mailbox"}
      </button>
      {pending && <IndeterminateProgressBar />}
      {result && (
        <span className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</span>
      )}
    </div>
  );
}
