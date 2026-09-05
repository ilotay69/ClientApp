"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SyncAutotaskButton({
  action,
}: {
  action: () => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
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
            // revalidatePath (in the server action) invalidates the cache
            // but doesn't refetch an already-mounted page on its own —
            // this button isn't a <form action>, whose submissions get
            // that refresh for free. Without this, the sync visibly
            // finishes but the list on screen stays stale until a manual
            // reload.
            router.refresh();
          })
        }
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        {syncing ? "Syncing..." : "Sync Autotask"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
