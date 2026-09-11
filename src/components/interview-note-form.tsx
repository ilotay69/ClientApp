"use client";

import { useActionState, useEffect, useRef } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";
import type { AddInterviewNoteState } from "@/app/(dashboard)/recruitment/actions";

/** Same shape as CandidateReplyForm — always visible, not collapsed behind a
 * button, since adding a note is meant to be quick and frequent. */
export function InterviewNoteForm({
  resumeId,
  action,
}: {
  resumeId: string;
  action: (
    resumeId: string,
    prev: AddInterviewNoteState,
    formData: FormData
  ) => Promise<AddInterviewNoteState>;
}) {
  const [state, formAction, pending] = useActionState<AddInterviewNoteState, FormData>(
    action.bind(null, resumeId),
    { error: null, success: null }
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      submittedRef.current = false;
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        e.stopPropagation();
        submittedRef.current = true;
      }}
      onClick={(e) => e.stopPropagation()}
      className="space-y-2"
    >
      <textarea
        name="note"
        rows={2}
        required
        placeholder="Add an interview note…"
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add note"}
        </button>
        {pending && <IndeterminateProgressBar />}
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
