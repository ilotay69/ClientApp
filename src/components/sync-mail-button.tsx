"use client";

import { useActionState } from "react";
import { syncNow, type SyncState } from "@/app/(dashboard)/settings/mail/actions";

const initialState: SyncState = { error: null, summary: null };

export function SyncMailButton({ label = "Sync now" }: { label?: string }) {
  const [state, formAction, pending] = useActionState(syncNow, initialState);

  return (
    <div>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Syncing..." : label}
        </button>
      </form>
      {state.summary && <p className="mt-2 text-sm text-emerald-700">{state.summary}</p>}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
