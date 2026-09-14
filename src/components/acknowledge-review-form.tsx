"use client";

import { useState, useTransition } from "react";

type AckState = { ok: boolean; message: string };
type Intent = "acknowledge" | "discuss";

export function AcknowledgeReviewForm({
  token,
  action,
  initialMode = "choose",
}: {
  token: string;
  action: (token: string, intent: Intent, remarks: string) => Promise<AckState>;
  initialMode?: "choose" | "discuss";
}) {
  const [mode, setMode] = useState<"choose" | "discuss">(initialMode);
  const [remarks, setRemarks] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AckState | null>(null);

  function submit(intent: Intent, value: string) {
    startTransition(async () => {
      const res = await action(token, intent, value);
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

  if (mode === "discuss") {
    return (
      <div className="mt-4 space-y-3">
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={4}
          placeholder="What would you like to discuss?"
          disabled={pending}
          autoFocus
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submit("discuss", remarks)}
            disabled={pending || !remarks.trim()}
            className="flex-1 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => setMode("choose")}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Back
          </button>
        </div>
        {!remarks.trim() && (
          <p className="text-xs text-slate-400">Add a note above before submitting.</p>
        )}
        {result && !result.ok && <p className="text-xs text-red-600">{result.message}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => submit("acknowledge", "")}
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Acknowledge"}
      </button>
      <button
        type="button"
        onClick={() => setMode("discuss")}
        disabled={pending}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        Need to Discuss
      </button>
      {result && !result.ok && <p className="w-full text-xs text-red-600">{result.message}</p>}
    </div>
  );
}
