"use client";

import { useActionState } from "react";
import type { DashboardWidgetDef } from "@/lib/dashboard-widgets";

type FormState = { error: string | null; success: string | null };
const initialState: FormState = { error: null, success: null };

export function DashboardPreferencesForm({
  widgets,
  enabledKeys,
  saveAction,
}: {
  widgets: DashboardWidgetDef[];
  enabledKeys: string[];
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const enabledSet = new Set(enabledKeys);

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {widgets.map((w) => (
        <label
          key={w.key}
          className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <input type="checkbox" name="widgets" value={w.key} defaultChecked={enabledSet.has(w.key)} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-900">{w.label}</p>
            <p className="text-xs text-slate-500">{w.description}</p>
          </div>
        </label>
      ))}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
