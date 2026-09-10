"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type { ProjectTicketDetail } from "@/app/(dashboard)/projects/actions";

/** Same expand-to-load pattern as ClientAutotaskTickets on the Clients page
 * — description/resolution/notes/time entries are all live-fetched (never
 * persisted) on first expand, not before, for exactly the same reason: most
 * of this is never looked at, so fetching it on every sync would just burn
 * through Autotask's shared rate limit for nothing. Simpler than that
 * component since a project only ever has ONE originating ticket, not a
 * list. */
export function ProjectAutotaskTicketDetail({
  ticketId,
  detailAction,
}: {
  ticketId: number;
  detailAction: (ticketId: number) => Promise<ProjectTicketDetail>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ProjectTicketDetail | null>(null);
  const [loading, startLoad] = useTransition();

  const toggle = () => {
    setExpanded((prev) => !prev);
    if (!detail) {
      startLoad(async () => {
        setDetail(await detailAction(ticketId));
      });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-2 text-left hover:bg-slate-50"
      >
        <h2 className="text-sm font-semibold text-slate-900">Ticket details</h2>
        <span className="text-xs text-slate-500">
          {expanded ? "Hide" : "Show description, notes & charges"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          {loading && <p className="text-sm text-slate-500">Loading…</p>}
          {detail && "error" in detail && <p className="text-sm text-red-600">{detail.error}</p>}

          {detail && !("error" in detail) && (
            <>
              <div className="flex items-center gap-2">
                {detail.ticket.priority && <Badge value={detail.ticket.priority} />}
                {detail.ticket.status && <Badge value={detail.ticket.status} />}
              </div>

              {detail.ticket.description && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Description
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {detail.ticket.description}
                  </p>
                </div>
              )}

              {detail.ticket.resolution && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Resolution
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {detail.ticket.resolution}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</h3>
                {detail.notes.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">No notes logged.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {detail.notes.map((n) => (
                      <li key={n.id} className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
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
                      <li key={e.id} className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
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
