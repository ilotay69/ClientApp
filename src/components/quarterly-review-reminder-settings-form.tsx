"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(dashboard)/settings/integrations/actions";

const initialState: FormState = { error: null, success: null };

export function QuarterlyReviewReminderSettingsForm({
  currentApproverEmail,
  currentIntervalDays,
  saveAction,
}: {
  currentApproverEmail: string;
  currentIntervalDays: number;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Quarterly Review Reminders</h2>
        <p className="mt-1 text-xs text-slate-500">
          Who can approve a quarterly review, and how often an unacknowledged &quot;sent&quot; review gets
          automatically re-emailed to the client (labeled First Reminder, Second Reminder, and so on) until
          they acknowledge it.
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Approver Email</label>
          <input
            type="email"
            name="approver_email"
            defaultValue={currentApproverEmail}
            placeholder="approver@cgtechnologies.com"
            className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Remind Every (days)</label>
          <input
            type="number"
            name="reminder_interval_days"
            min={1}
            max={90}
            defaultValue={currentIntervalDays}
            className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
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
