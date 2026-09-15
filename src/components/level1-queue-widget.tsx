"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/badge";
import { DashboardDot } from "@/components/dashboard-widget-card";
import { IconAlertTriangle } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import type { UnassignedLevel1Ticket } from "@/app/(dashboard)/dashboard/actions";

type ActionResult = { rows: UnassignedLevel1Ticket[] } | { error: string };

/** Live from Autotask, fetched client-side after the rest of the Dashboard
 * has already rendered — same reasoning as TeamHoursWidget. The local
 * autotask_tickets cache used elsewhere in this app is only as fresh as
 * the last account-wide sync (not on a fixed schedule, can lag by days),
 * which isn't good enough for "what's sitting unpicked right now" — this
 * widget has to hit Autotask directly instead. */
export function Level1QueueWidget({ action }: { action: () => Promise<ActionResult> }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [showAll, setShowAll] = useState(false);

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

  const rows = state && "rows" in state ? state.rows : [];
  const visible = showAll ? rows : rows.slice(0, 5);

  return (
    <div className="relative rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-white shadow-sm transition-shadow hover:shadow-md">
      {state && "rows" in state && rows.length > 0 && (
        <span
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow ring-2 ring-white"
          title="Needs attention"
          aria-hidden="true"
        >
          !
        </span>
      )}
      <div className="flex items-center justify-between gap-2.5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
            <IconAlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              Level 1 Queue - waiting for tech to pick up
            </p>
            <p className="truncate text-xs font-medium text-red-700/70">unassigned</p>
          </div>
        </div>
        <span className="shrink-0 text-3xl font-bold tabular-nums text-red-600">
          {state && "rows" in state ? rows.length : "—"}
        </span>
      </div>
      <div className="mx-2 mb-2 overflow-hidden rounded-xl bg-white/80 ring-1 ring-slate-100">
        {!state ? (
          <p className="px-4 py-2 text-sm text-slate-500">Loading from Autotask…</p>
        ) : "error" in state ? (
          <p className="px-4 py-2 text-sm text-red-600">{state.error}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-2 text-sm text-slate-500">Nothing unassigned in Level 1 right now.</p>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {visible.map((t) => (
                <TicketRow key={t.id} ticket={t} />
              ))}
            </div>
            {rows.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="w-full border-t border-slate-100 px-4 py-2 text-left text-xs font-medium text-brand hover:underline"
              >
                {showAll ? "Show fewer" : `Show ${rows.length - 5} more`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TicketRow({ ticket: t }: { ticket: UnassignedLevel1Ticket }) {
  const inner = (
    <>
      <DashboardDot accent="red" />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            {t.ticketNumber ? `#${t.ticketNumber} — ` : ""}
            {t.title}
          </p>
          <p className="truncate text-xs text-slate-500">
            {t.clientName}
            {t.openedAt ? ` · created ${formatDateTime(t.openedAt)}` : ""}
          </p>
        </div>
        {t.priority && <Badge value={t.priority} />}
      </span>
    </>
  );

  if (!t.ticketUrl) {
    return <div className="flex items-center gap-2.5 px-4 py-1.5">{inner}</div>;
  }
  return (
    <a
      href={t.ticketUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-slate-50"
    >
      {inner}
    </a>
  );
}
