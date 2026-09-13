"use client";

import { useState } from "react";
import { NewQuarterlyReviewForm } from "@/components/new-quarterly-review-form";

/** Collapsed by default — decluttering the main page down to just the
 * client picker and existing-reviews list until staff actually want to
 * start one. */
export function NewReviewPanel({
  clients,
  defaultClientId,
  action,
}: {
  clients: { id: string; name: string }[];
  defaultClientId: string | null;
  action: (
    clientId: string,
    reviewPeriod: string,
    confirmDuplicate: boolean
  ) => Promise<{ error: string } | undefined>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
      >
        {open ? "Cancel" : "+ New Review"}
      </button>
      {open && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <NewQuarterlyReviewForm clients={clients} defaultClientId={defaultClientId} action={action} />
        </div>
      )}
    </div>
  );
}
