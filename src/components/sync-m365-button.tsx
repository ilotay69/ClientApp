"use client";

import { useState, useTransition } from "react";

export function SyncM365Button({
  action,
}: {
  action: () => Promise<{ error: string | null }>;
}) {
  const [syncing, startSync] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={syncing}
        onClick={() =>
          startSync(async () => {
            const result = await action();
            setError(result.error);
          })
        }
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        {syncing ? "Syncing..." : "Sync M365"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
