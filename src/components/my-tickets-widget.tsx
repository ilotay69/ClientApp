"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { DashboardWidgetCard, DashboardDot, type DashboardAccent } from "@/components/dashboard-widget-card";
import { IconFlag } from "@/components/icons";
import type { MyOpenTicketRow, MyOpenTicketsResult } from "@/lib/my-tickets";

type ActionResult = MyOpenTicketsResult | { error: string };

/** Same lazy-load-after-mount pattern as Level1QueueWidget/TeamHoursWidget —
 * the underlying fetchMyOpenTicketsAction hits Autotask live, which used to
 * be bundled into the dashboard page's main data Promise.all and made the
 * whole page wait on it. Fetching client-side means the rest of the
 * dashboard renders immediately and this card fills in a moment later. */
export function MyTicketsWidget({ action, fullName }: { action: () => Promise<ActionResult>; fullName: string | null }) {
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

  const tickets = state && "tickets" in state ? state.tickets : [];

  return (
    <DashboardWidgetCard
      title="My Tickets"
      count={tickets.length}
      countLabel="open Autotask tickets"
      icon={IconFlag}
      accent="pink"
      href="/my-todo?tab=tickets"
    >
      {!state ? (
        <p className="px-4 py-2 text-sm text-slate-500">Loading from Autotask…</p>
      ) : "error" in state ? (
        <p className="px-4 py-2 text-sm text-red-600">{state.error}</p>
      ) : tickets.length === 0 ? (
        <p className="px-4 py-2 text-sm text-slate-500">
          {state.matchedResourceName === null
            ? `Couldn't match "${fullName ?? "your name"}" to an active Autotask resource — set yours explicitly under Settings → My Profile.`
            : "No open tickets assigned to you."}
        </p>
      ) : (
        tickets.slice(0, 5).map((t: MyOpenTicketRow) => (
          <Link
            key={t.id}
            href="/my-todo?tab=tickets"
            className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-slate-50"
          >
            <DashboardDot accent={"pink" as DashboardAccent} />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {t.ticketNumber ? `#${t.ticketNumber} — ` : ""}
                  {t.title}
                </p>
                <p className="truncate text-xs text-slate-500">{t.clientName ?? "Unknown client"}</p>
              </div>
              {t.priority && <Badge value={t.priority} />}
            </span>
          </Link>
        ))
      )}
    </DashboardWidgetCard>
  );
}
