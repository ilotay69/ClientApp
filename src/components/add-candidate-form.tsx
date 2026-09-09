"use client";

import { useActionState, useEffect, useRef, useState } from "react";

type AddCandidateState = { error: string | null };

/** Collapsed behind a button by default — expands to a small form, and
 * collapses itself again once a save actually succeeds (submittedRef tells
 * the effect this run was a real submit, not just the initial idle state,
 * which also has error: null). */
export function AddCandidateForm({
  action,
}: {
  action: (prev: AddCandidateState, formData: FormData) => Promise<AddCandidateState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<AddCandidateState, FormData>(action, {
    error: null,
  });
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      submittedRef.current = false;
      setOpen(false);
    }
  }, [pending, state.error]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
      >
        + Add candidate manually
      </button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submittedRef.current = true;
      }}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label className="block text-xs font-medium text-slate-700">Name</label>
        <input
          type="text"
          name="candidate_name"
          required
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">
          Email <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          type="email"
          name="candidate_email"
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">
          Phone <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          type="text"
          name="candidate_phone"
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
