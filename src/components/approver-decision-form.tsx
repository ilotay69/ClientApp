"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DecisionState = { ok: boolean; message: string };

export function ApproverDecisionForm({
  reviewId,
  approveAction,
  requestAdjustmentAction,
}: {
  reviewId: string;
  approveAction: (reviewId: string) => Promise<DecisionState>;
  requestAdjustmentAction: (reviewId: string, notes: string) => Promise<DecisionState>;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function approve() {
    setMessage(null);
    startTransition(async () => {
      const result = await approveAction(reviewId);
      setMessage(result.message);
      if (result.ok) router.push("/quarterly-reviews");
    });
  }

  function requestChanges() {
    if (!notes.trim()) {
      setMessage("Add a note about what needs adjusting first.");
      return;
    }
    startTransition(async () => {
      const result = await requestAdjustmentAction(reviewId, notes);
      setMessage(result.message);
      if (result.ok) router.push("/quarterly-reviews");
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Remarks — only needed if you're sending this back for adjustments"
        rows={3}
        disabled={pending}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Working…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={requestChanges}
          disabled={pending}
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
        >
          {pending ? "Working…" : "Send back for adjustments"}
        </button>
      </div>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
