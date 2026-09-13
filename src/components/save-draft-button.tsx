"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Every field on a draft review already auto-saves on its own (status
 * selects on change, text fields on blur) — this button doesn't add any
 * new persistence, it's purely a reassurance/checkpoint for staff working
 * a review over several days: click it, see "All changes saved," and
 * leave with confidence rather than trusting a silent auto-save alone.
 * router.refresh() also means it doubles as "pull the latest" if someone
 * else touched this review meanwhile. */
export function SaveDraftButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    startTransition(() => {
      router.refresh();
      setSaved(true);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Draft"}
      </button>
      {saved && !pending && <span className="text-sm text-emerald-700">All changes saved.</span>}
    </div>
  );
}
