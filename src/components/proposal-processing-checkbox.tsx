"use client";

import { useState, useTransition } from "react";

type ActionResult = { ok: boolean; message: string };

/** Only ever rendered next to an already-accepted proposal's "Accepted"
 * detail — checking it flags the proposal as being worked on internally
 * (fulfillment/onboarding started) without touching its actual status,
 * which moves it from the Accepted tab to its own Processing Internally
 * tab on the Proposals list (see bucketOf in proposals/page.tsx). */
export function ProposalProcessingCheckbox({
  proposalId,
  initialChecked,
  action,
}: {
  proposalId: string;
  initialChecked: boolean;
  action: (proposalId: string, checked: boolean) => Promise<ActionResult>;
}) {
  const [checked, setChecked] = useState(initialChecked);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setChecked(next);
    startTransition(async () => {
      const res = await action(proposalId, next);
      // Revert on failure rather than trusting the optimistic click — the
      // server re-checks status = 'accepted' independently of this UI.
      if (!res.ok) setChecked(!next);
    });
  };

  return (
    <label className="mt-1 flex items-center justify-end gap-1.5 text-xs text-slate-500">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => toggle(e.target.checked)}
        className="rounded border-slate-300 text-brand focus:ring-brand"
      />
      Processing Internally Now
    </label>
  );
}
