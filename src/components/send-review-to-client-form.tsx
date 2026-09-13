"use client";

import { useState, useTransition } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";

/** The email box is deliberately blank/free-typed rather than a fixed
 * client contact lookup — this is being tried out before wiring to a real
 * contact, per how this workflow step was asked for. Pre-filled with the
 * client's own primary contact email when one exists, purely as a
 * convenience default; still fully editable either way. */
export function SendReviewToClientForm({
  reviewId,
  defaultEmail,
  action,
}: {
  reviewId: string;
  defaultEmail: string | null;
  action: (reviewId: string, testEmail: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setResult(null);
    startTransition(async () => {
      setResult(await action(reviewId, email));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="client@example.com"
        className="w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={run}
        disabled={pending || !email.trim()}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send to client"}
      </button>
      {pending && <IndeterminateProgressBar />}
      {result && (
        <span className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</span>
      )}
    </div>
  );
}
