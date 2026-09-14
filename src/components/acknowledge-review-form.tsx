"use client";

import { useState, useTransition } from "react";

type AckState = { ok: boolean; message: string };

/** "Need to Discuss" used to be a second button here with its own remarks
 * textarea — removed in favor of a plain instruction to reply to the email
 * instead (see buildQuarterlyReviewClientEmail and the page above this
 * form), so a discussion always lands as a real reply someone reads rather
 * than a stored note. This is now just the one Acknowledge action. */
export function AcknowledgeReviewForm({
  token,
  action,
}: {
  token: string;
  action: (token: string) => Promise<AckState>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AckState | null>(null);

  function submit() {
    startTransition(async () => {
      const res = await action(token);
      setResult(res);
    });
  }

  if (result?.ok) {
    return (
      <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        {result.message}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Acknowledge"}
      </button>
      {result && !result.ok && <p className="mt-2 text-xs text-red-600">{result.message}</p>}
    </div>
  );
}
