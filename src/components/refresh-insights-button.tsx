"use client";

import { useActionState } from "react";
import { refreshInsights, type RefreshState } from "@/app/(dashboard)/dashboard/actions";

const initialState: RefreshState = { error: null, summary: null };

export function RefreshInsightsButton() {
  const [state, formAction, pending] = useActionState(refreshInsights, initialState);

  return (
    <div className="flex items-center gap-3">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {pending ? "Checking recent emails..." : "Refresh insights"}
        </button>
      </form>
      {state.summary && <p className="text-sm text-slate-500">{state.summary}</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
