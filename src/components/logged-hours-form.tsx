"use client";

import { useActionState } from "react";
import type { LoggedHoursActionState } from "@/app/(dashboard)/hours-logged/actions";

const initialState: LoggedHoursActionState = { error: null };

/** Re-submitting the same date corrects that day's total in place (see
 * upsertLoggedHoursAction) rather than adding a second entry, so this is
 * the one form for both "log today's hours" and "fix a day I got wrong". */
export function LoggedHoursForm({
  action,
  defaultDate,
}: {
  action: (prevState: LoggedHoursActionState, formData: FormData) => Promise<LoggedHoursActionState>;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label className="block text-xs font-medium text-slate-700">Date</label>
        <input
          type="date"
          name="work_date"
          defaultValue={defaultDate}
          required
          className="mt-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Hours</label>
        <input
          type="number"
          name="hours"
          step="0.25"
          min="0.25"
          max="24"
          required
          placeholder="8"
          className="mt-1 w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : "Log hours"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
