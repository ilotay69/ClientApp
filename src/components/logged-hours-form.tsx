"use client";

import { useActionState, useState } from "react";
import type { LoggedHoursActionState } from "@/app/(dashboard)/hours-logged/actions";
import { LOGGED_HOURS_LABEL_OPTIONS, type LoggedHoursLabel } from "@/lib/logged-hours-labels";

const initialState: LoggedHoursActionState = { error: null };

/** Re-submitting the same date and label corrects that entry in place (see
 * upsertLoggedHoursAction) rather than adding a duplicate, so this is the
 * one form for both "log today's hours" and "fix a day I got wrong". Taken
 * Off subtracts from the running total shown below instead of adding to
 * it - the number typed here always stays positive either way. */
export function LoggedHoursForm({
  action,
  defaultDate,
}: {
  action: (prevState: LoggedHoursActionState, formData: FormData) => Promise<LoggedHoursActionState>;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [label, setLabel] = useState<LoggedHoursLabel>("regular");

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <input type="hidden" name="label" value={label} />
      <div>
        <label className="block text-xs font-medium text-slate-700">Date</label>
        <input
          type="date"
          name="work_date"
          defaultValue={defaultDate}
          required
          className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
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
          className="mt-1 w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Label</label>
        <div className="mt-1 flex gap-1">
          {LOGGED_HOURS_LABEL_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setLabel(o.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                label === o.value
                  ? "bg-brand text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : "Log hours"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
