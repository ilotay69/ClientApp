"use client";

import { useActionState } from "react";
import type { Touchpoint } from "@/lib/types";
import type { FormState } from "@/app/(dashboard)/touchpoints/actions";

const initialState: FormState = { error: null };

export function TouchpointForm({
  touchpoint,
  clients,
  defaultClientId,
  action,
  submitLabel,
}: {
  touchpoint?: Touchpoint;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Client</label>
        <select
          name="client_id"
          required
          defaultValue={touchpoint?.client_id ?? defaultClientId ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="" disabled>
            Select a client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Type</label>
        <select
          name="type"
          defaultValue={touchpoint?.type ?? "personal_checkin"}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="personal_checkin">Personal check-in</option>
          <option value="quarterly_review">Quarterly review (QBR)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Due date</label>
        <input
          type="date"
          name="due_date"
          required
          defaultValue={touchpoint?.due_date ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <p className="mt-0.5 text-xs text-slate-500">
          For quarterly reviews, paste meeting notes here directly (e.g. from
          Granola or another notetaker) — related emails around this date are
          shown below for context once this is saved.
        </p>
        <textarea
          name="notes"
          rows={8}
          defaultValue={touchpoint?.notes ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
