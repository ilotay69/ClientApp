"use client";

import { useActionState } from "react";
import type { RefreshClientInsightsState } from "@/app/(dashboard)/clients/actions";

const initialState: RefreshClientInsightsState = { error: null, summary: null };

export function RefreshClientInsightsButton({
  action,
}: {
  action: (
    prevState: RefreshClientInsightsState,
    formData: FormData
  ) => Promise<RefreshClientInsightsState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="flex items-center gap-3">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {pending ? "Checking..." : "Refresh insights"}
        </button>
      </form>
      {state.summary && <p className="text-sm text-slate-500">{state.summary}</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
