"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import { EmptyRow } from "@/components/portal-ui";
import type { PortalTicketListItem } from "@/lib/portal-data";

export function PortalTicketsTable({ tickets }: { tickets: PortalTicketListItem[] }) {
  if (tickets.length === 0) return <EmptyRow>No tickets match this filter.</EmptyRow>;
  return (
    <div className="divide-y divide-slate-100">
      {tickets.map((t) => (
        <TicketRow key={t.id} ticket={t} />
      ))}
    </div>
  );
}

/** No fetch on expand at all — every field shown here, billable time
 * entries included, is already in the array passed down at initial render
 * (see fetchPortalTicketList). Simpler than the staff-facing
 * client-autotask-tickets.tsx, which lazy-loads on first expand instead.
 * Ticket NOTES specifically are still excluded (see the plan: the only
 * existing notes fetcher pulls internal-only remarks with no
 * customer-visible filter, unsafe to show a client) — that's a different
 * concern from time entries, which carry no such internal/external
 * distinction beyond the isNonBillable filter already applied upstream. */
function TicketRow({ ticket }: { ticket: PortalTicketListItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            {ticket.ticketNumber ? `#${ticket.ticketNumber} — ` : ""}
            {ticket.title}
          </p>
          <p className="text-xs text-slate-500">
            {ticket.openedAt ? `Opened ${formatDate(ticket.openedAt)}` : ""}
            {ticket.dueDate ? ` · Due ${formatDate(ticket.dueDate)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ticket.priority && <Badge value={ticket.priority} />}
          {ticket.status && <Badge value={ticket.status} />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
          {ticket.description && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Description
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p>
            </div>
          )}
          {ticket.resolution && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Resolution
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{ticket.resolution}</p>
            </div>
          )}
          {!ticket.description && !ticket.resolution && (
            <p className="text-sm text-slate-500">No further detail on this ticket.</p>
          )}
          {ticket.lastActivityAt && (
            <p className="text-xs text-slate-400">
              Last activity {formatDate(ticket.lastActivityAt)}
            </p>
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Billable time
              {ticket.billableTimeEntries.length > 0
                ? ` (${ticket.billableTimeEntries.reduce((s, e) => s + e.hoursWorked, 0).toFixed(2)} hrs)`
                : ""}
            </h3>
            {ticket.billableTimeEntries.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">No billable time logged yet.</p>
            ) : (
              <div className="mt-1 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                {ticket.billableTimeEntries.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-700">{e.summaryNotes || "—"}</p>
                      <p className="text-xs text-slate-400">
                        {formatDate(e.dateWorked)}
                        {e.resourceName ? ` · ${e.resourceName}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-slate-600">
                      {e.hoursWorked.toFixed(2)} hrs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
