"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(dashboard)/settings/integrations/actions";

const initialState: FormState = { error: null, success: null };

export function SalesNotificationSettingsForm({
  currentRepEmail,
  saveAction,
}: {
  currentRepEmail: string | null;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Internal Sales</h2>
        <p className="mt-1 text-xs text-slate-500">
          Whoever's entered here gets emailed whenever a sales request is created, changed, or
          noted — alongside whoever it's currently assigned to.
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Internal Rep Email</label>
          <input
            type="email"
            name="rep_email"
            defaultValue={currentRepEmail ?? ""}
            placeholder="sales@cgtechnologies.com"
            className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
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
    </div>
  );
}
