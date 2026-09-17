"use client";

import { useActionState } from "react";
import type { AutotaskActiveResource } from "@/lib/autotask";

type FormState = { error: string | null; success: string | null };
const initialState: FormState = { error: null, success: null };

export function MyAutotaskResourceForm({
  resources,
  currentResourceId,
  saveAction,
}: {
  resources: AutotaskActiveResource[];
  currentResourceId: number | null;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">Autotask resource</label>
        <select
          name="autotask_resource_id"
          defaultValue={currentResourceId != null ? String(currentResourceId) : ""}
          className="mt-1 w-full sm:w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">Not set — match by name instead</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="w-full text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
