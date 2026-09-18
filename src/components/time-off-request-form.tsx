"use client";

import { useActionState, useState } from "react";
import type { TimeOffActionState } from "@/app/(dashboard)/time-off/actions";

const initialState: TimeOffActionState = { error: null };

const TYPE_OPTIONS = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick" },
] as const;

export function TimeOffRequestForm({
  action,
  defaultDate,
}: {
  action: (prevState: TimeOffActionState, formData: FormData) => Promise<TimeOffActionState>;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [type, setType] = useState<"vacation" | "sick">("vacation");

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <input type="hidden" name="type" value={type} />
      <div>
        <label className="block text-xs font-medium text-slate-700">Type</label>
        <div className="mt-1 flex gap-1">
          {TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setType(o.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                type === o.value
                  ? "bg-brand text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Start</label>
        <input
          type="date"
          name="start_date"
          defaultValue={defaultDate}
          required
          className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">End</label>
        <input
          type="date"
          name="end_date"
          defaultValue={defaultDate}
          required
          className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="min-w-40 flex-1">
        <label className="block text-xs font-medium text-slate-700">Reason (optional)</label>
        <input
          type="text"
          name="reason"
          placeholder="e.g. Family trip"
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Request"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
