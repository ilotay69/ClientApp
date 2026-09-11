"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";
import type { SendCandidateReplyState } from "@/app/(dashboard)/recruitment/actions";

/** Always visible, not collapsed behind a button like ScheduleInterviewForm
 * — sending a quick message is lower-friction and more frequent than
 * scheduling an interview, so it shouldn't need an extra click to reveal. */
export function CandidateReplyForm({
  resumeId,
  action,
  extraActions,
}: {
  resumeId: string;
  action: (
    resumeId: string,
    prev: SendCandidateReplyState,
    formData: FormData
  ) => Promise<SendCandidateReplyState>;
  /** Rendered in the same row as the Send message button (e.g. Schedule
   * Interview) — passed in rather than nested inside the <form> below
   * since it can itself expand into a <form>, and forms can't nest. */
  extraActions?: ReactNode;
}) {
  const formId = `candidate-reply-${resumeId}`;
  const [state, formAction, pending] = useActionState<SendCandidateReplyState, FormData>(
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
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <form
        id={formId}
        ref={formRef}
        action={formAction}
        onSubmit={(e) => {
          e.stopPropagation();
          submittedRef.current = true;
        }}
      >
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Write a message to this candidate…"
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send message"}
        </button>
        {pending && <IndeterminateProgressBar />}
        {extraActions}
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="text-xs text-emerald-600">{state.success}</p>}
    </div>
  );
}
