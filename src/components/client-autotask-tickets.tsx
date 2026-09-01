"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type { AutotaskTicketNote, AutotaskTimeEntry } from "@/lib/autotask";

export type AutotaskTicketRow = {
  id: number;
  ticket_number: string | null;
  title: string;
  description: string | null;
  resolution: string | null;
  status: string | null;
  priority: string | null;
  queue_name: string | null;
  assigned_resource_name: string | null;
  due_date: string | null;
};

type TicketDetail = { notes: AutotaskTicketNote[]; timeEntries: AutotaskTimeEntry[] } | { error: string };

export function ClientAutotaskTickets({
  companyId,
  tickets,
  detailAction,
}: {
  companyId: number | null;
  tickets: AutotaskTicketRow[];
  detailAction: (ticketId: number) => Promise<TicketDetail>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Tickets</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {companyId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Autotask using the button at the top of the page to see its tickets
            here.
          </p>
        ) : (
          <>
            {tickets.map((t) => (
              <TicketRow key={t.id} ticket={t} detailAction={detailAction} />
            ))}
            {tickets.length === 0 && (
              <p className="px-5 py-4 text-sm text-slate-500">
                No open tickets for this client right now.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  detailAction,
}: {
  ticket: AutotaskTicketRow;
  detailAction: (ticketId: number) => Promise<TicketDetail>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, startLoad] = useTransition();

  const toggle = () => {
    setExpanded((prev) => !prev);
    if (!detail) {
      startLoad(async () => {
        setDetail(await detailAction(ticket.id));
      });
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {ticket.ticket_number ? `#${ticket.ticket_number} — ` : ""}
            {ticket.title}
          </p>
          <p className="text-xs text-slate-500">
            {ticket.assigned_resource_name
              ? `Assigned to ${ticket.assigned_resource_name}`
              : "Unassigned"}
            {ticket.due_date ? ` · due ${formatDate(ticket.due_date)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ticket.priority && <Badge value={ticket.priority} />}
          {ticket.status && <Badge value={ticket.status} />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-5 py-4">
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

          {loading && <p className="text-sm text-slate-500">Loading activity...</p>}

          {detail && "error" in detail && <p className="text-sm text-red-600">{detail.error}</p>}

          {detail && !("error" in detail) && (
            <>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notes
                </h3>
                {detail.notes.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">No notes logged.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {detail.notes.map((n) => (
                      <li key={n.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                        <p className="text-xs text-slate-500">
                          {formatDate(n.createdAt)}
                          {n.creatorName ? ` · ${n.creatorName}` : ""}
                          {n.title ? ` · ${n.title}` : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                          {n.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Charges (time entries)
                </h3>
                {detail.timeEntries.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">No time logged.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {detail.timeEntries.map((e) => (
                      <li key={e.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                        <p className="text-xs text-slate-500">
                          {formatDate(e.dateWorked)}
                          {e.resourceName ? ` · ${e.resourceName}` : ""}
                          {e.hoursWorked != null ? ` · ${e.hoursWorked}h` : ""}
                        </p>
                        {e.summaryNotes && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                            {e.summaryNotes}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
