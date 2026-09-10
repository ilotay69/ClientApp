"use client";

import { useTransition } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";

/** Calls action directly inside a transition rather than relying on a
 * native <form action> submission — the same pattern already used for
 * remove/reset actions in client-access-panel.tsx — so pending state is
 * actually visible here (a plain form submission gives this component no
 * JS-visible signal of its own to show a progress bar against). A bound
 * server action's own redirect()/revalidatePath() still work identically
 * called this way. */
export function DeleteButton({
  action,
  confirmText,
  label = "Delete",
}: {
  action: () => Promise<void>;
  confirmText: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          startTransition(() => action());
        }}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "Deleting…" : label}
      </button>
      {pending && <IndeterminateProgressBar />}
    </div>
  );
}
