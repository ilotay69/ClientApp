"use client";

import { useState, useTransition } from "react";

type AckState = { ok: boolean; message: string };

export function AcknowledgeReviewForm({
  token,
  action,
}: {
  token: string;
  action: (token: string, remarks: string) => Promise<AckState>;
}) {
  const [remarks, setRemarks] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AckState | null>(null);

  function submit() {
    startTransition(async () => {
      const res = await action(token, remarks);
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
    <div className="mt-4 space-y-3">
      <textarea
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        rows={4}
        placeholder="Remarks (optional)"
        disabled={pending}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Acknowledge This Review"}
      </button>
      {result && !result.ok && <p className="text-xs text-red-600">{result.message}</p>}
    </div>
  );
}
