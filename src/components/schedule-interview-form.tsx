"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";
import type { ScheduleInterviewState } from "@/app/(dashboard)/recruitment/actions";

const DURATION_OPTIONS = [
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
];

/** Emails the candidate a standard .ics calendar invite (see
 * src/lib/ics.ts) — date/time entered here are CG Technologies' own local
 * (Toronto) time, converted server-side to UTC for the actual invite. */
export function ScheduleInterviewForm({
  resumeId,
  action,
}: {
  resumeId: string;
  action: (
    resumeId: string,
    prev: ScheduleInterviewState,
    formData: FormData
  ) => Promise<ScheduleInterviewState>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ScheduleInterviewState, FormData>(
    action.bind(null, resumeId),
    { error: null, success: null }
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  // Collapses back to the "invite sent" confirmation once a send actually
  // succeeds — checking state.success alone isn't enough since it's also
  // null before any submit has happened at all.
  useEffect(() => {
    if (submittedRef.current && !pending && state.success) {
      submittedRef.current = false;
      setFormOpen(false);
    }
  }, [pending, state.success]);

  if (!formOpen) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Schedule Interview
        </button>
        {state.success && <p className="mt-1 text-xs text-emerald-600">{state.success}</p>}
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Schedule interview
      </p>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={() => {
          submittedRef.current = true;
        }}
        className="mt-2 flex flex-wrap items-end gap-2"
      >
        <div>
          <label className="block text-xs font-medium text-slate-700">Date</label>
          <input
            type="date"
            name="date"
            required
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Time</label>
          <input
            type="time"
            name="time"
            required
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Duration</label>
          <select
            name="duration_minutes"
            defaultValue="30"
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="block text-xs font-medium text-slate-700">
            Location <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            name="location"
            placeholder="Office address, or a Zoom/Teams link"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div className="w-full">
          <label className="block text-xs font-medium text-slate-700">
            Notes <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            name="notes"
            rows={2}
            placeholder="Anything the candidate should know ahead of time…"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            className="text-xs text-slate-500 underline"
          >
            Cancel
          </button>
        </div>
        {pending && <IndeterminateProgressBar />}
        {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      </form>
    </div>
  );
}
