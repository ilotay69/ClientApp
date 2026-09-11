"use client";

import { useActionState } from "react";

type CreateJobPostingState = { error: string | null };

/** "Save" always inserts a new job_postings row — job_postings is
 * append-only (see the plan): there's no "active" flag to flip, editing
 * just means creating the next one, which is what lets past resumes keep
 * pointing at whatever posting they were actually screened against. */
export function JobPostingForm({
  currentTitle,
  currentDescription,
  action,
}: {
  currentTitle: string;
  currentDescription: string;
  action: (prev: CreateJobPostingState, formData: FormData) => Promise<CreateJobPostingState>;
}) {
  const [state, formAction, pending] = useActionState<CreateJobPostingState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700">Job title</label>
        <input
          type="text"
          name="title"
          defaultValue={currentTitle}
          placeholder="e.g. IT Support Technician"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Description / requirements
        </label>
        <textarea
          name="description"
          defaultValue={currentDescription}
          rows={5}
          placeholder="What the role needs — skills, experience, certifications..."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
