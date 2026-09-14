"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ActionState = { ok: boolean; message: string };

/** For when the client acknowledges by replying to the review email instead
 * of clicking the Acknowledge link — there's no button for them to click in
 * that case, so the approver records it here with a short note instead
 * (e.g. "confirmed by email 9/14"). Collapsed behind a toggle since this is
 * a fallback path, not the everyday one. */
export function MarkClientAcknowledgedForm({
  reviewId,
  action,
}: {
  reviewId: string;
  action: (reviewId: string, notes: string) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);

  function submit() {
    startTransition(async () => {
      const res = await action(reviewId, notes);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Client acknowledged (by email)
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-600">
        Record that the client acknowledged this review by replying to the email, rather than clicking the
        link.
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Optional note — e.g. how/when they confirmed"
        disabled={pending}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Recording…" : "Confirm acknowledged"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {result && !result.ok && <p className="text-xs text-red-600">{result.message}</p>}
    </div>
  );
}
