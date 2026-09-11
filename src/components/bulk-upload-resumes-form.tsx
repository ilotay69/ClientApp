"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";

type BulkUploadState = { error: string | null; success: string | null };

/** Collapsed behind a button by default, same pattern as AddCandidateForm —
 * stays open after a save (rather than collapsing like that form does) so
 * the result summary (created count + any per-file failures) is still
 * visible; the file picker itself resets so staff can immediately upload
 * another batch without reopening this. */
export function BulkUploadResumesForm({
  action,
}: {
  action: (prev: BulkUploadState, formData: FormData) => Promise<BulkUploadState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<BulkUploadState, FormData>(action, {
    error: null,
    success: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending) {
      submittedRef.current = false;
      formRef.current?.reset();
    }
  }, [pending]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
      >
        + Bulk upload resumes
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submittedRef.current = true;
      }}
      className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label className="block text-xs font-medium text-slate-700">Resume files</label>
        <p className="mt-0.5 text-xs text-slate-400">
          Select one or more PDF or Word (.docx) files — each becomes its own new
          candidate, not screened yet.
        </p>
        <input
          type="file"
          name="files"
          multiple
          required
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="mt-1 w-full text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        {pending && <IndeterminateProgressBar />}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600">{state.success}</p>}
    </form>
  );
}
