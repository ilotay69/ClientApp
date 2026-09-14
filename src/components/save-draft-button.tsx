"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/** Every field on a draft review already auto-saves on its own (status
 * selects on change, text fields on blur) — this button doesn't add any
 * new persistence, it's just "I'm done with this for now": takes staff
 * back to the reviews list rather than leaving them staring at the same
 * detail page. */
export function SaveDraftButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(() => {
      router.push("/quarterly-reviews");
    });
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={pending}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save Draft"}
    </button>
  );
}
