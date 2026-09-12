"use client";

import { useTransition } from "react";

/** Only hides the message from the rollup it's rendered in — the message
 * itself, and its place in that candidate's own thread under their row,
 * are completely unaffected. */
export function DismissMessageButton({
  messageId,
  action,
}: {
  messageId: string;
  action: (messageId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => action(messageId))}
      className="shrink-0 text-xs font-medium text-slate-400 underline hover:text-slate-600 disabled:opacity-60"
    >
      {pending ? "…" : "Dismiss"}
    </button>
  );
}
