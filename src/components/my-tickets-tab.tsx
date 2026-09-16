"use client";

import { useEffect, useState } from "react";
import { MyTicketsList } from "@/components/my-tickets-list";
import type { MyOpenTicketsResult } from "@/lib/my-tickets";

type ActionResult = MyOpenTicketsResult | { error: string };
type DescriptionResult = { description: string | null } | { error: string };

/** My To-Do's "My Tickets" tab — fetches the live Autotask list on mount
 * instead of the page's server render blocking on it, same reasoning as
 * MyTicketsWidget on the Dashboard. Every tab used to render together
 * (Tabs keeps all of them mounted, just hiding inactive ones), so this
 * live call ran even for someone who never looked at this tab; moving it
 * client-side at least means the rest of the page ships without waiting
 * on it. */
export function MyTicketsTab({
  action,
  descriptionAction,
  fullName,
}: {
  action: () => Promise<ActionResult>;
  descriptionAction: (ticketId: number) => Promise<DescriptionResult>;
  fullName: string | null;
}) {
  const [state, setState] = useState<ActionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    action().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">My Tickets</h2>
        <p className="mt-1 text-sm text-slate-500">Open Autotask tickets assigned to {fullName ?? "you"}.</p>
      </div>
      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        {!state ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">Loading from Autotask…</p>
        ) : "error" in state ? (
          <p className="px-5 py-6 text-center text-sm text-red-600">{state.error}</p>
        ) : state.tickets.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">
            {state.matchedResourceName === null
              ? `Couldn't match "${fullName ?? "your name"}" to an active Autotask resource — set yours explicitly under Settings → My Profile.`
              : "No open tickets assigned to you right now."}
          </p>
        ) : (
          <MyTicketsList tickets={state.tickets} descriptionAction={descriptionAction} />
        )}
      </div>
    </div>
  );
}
