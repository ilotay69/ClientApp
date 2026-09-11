"use client";

import { useActionState } from "react";

type PurchaseNoteState = { error: string | null };

/** Purchase channel (direct from Microsoft vs. through a distributor like
 * TD Synnex) isn't exposed by the tenant-scoped Graph API license data is
 * synced through — no Microsoft API call can tell us that, so it's a plain
 * manual note staff maintain themselves, shown right where reconciliation
 * is actually being reviewed. */
export function ClientPurchaseNoteField({
  clientId,
  currentNote,
  action,
}: {
  clientId: string;
  currentNote: string | null;
  action: (
    clientId: string,
    prev: PurchaseNoteState,
    formData: FormData
  ) => Promise<PurchaseNoteState>;
}) {
  const [state, formAction, pending] = useActionState<PurchaseNoteState, FormData>(
    action.bind(null, clientId),
    { error: null }
  );

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
      <div className="min-w-[16rem] flex-1">
        <label className="block text-sm font-medium text-slate-700">
          Purchased through <span className="font-normal text-slate-400">(manual note)</span>
        </label>
        <textarea
          name="note"
          defaultValue={currentNote ?? ""}
          rows={2}
          placeholder="e.g. Direct from Microsoft, or through TD Synnex — one line per instruction if there's more than one"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-6 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
