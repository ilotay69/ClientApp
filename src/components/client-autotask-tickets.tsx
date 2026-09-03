"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type { AutotaskTicketNote, AutotaskTimeEntry } from "@/lib/autotask";
import type { TicketInsight } from "@/lib/ticket-insights";

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
type AnalyzeResult = { insights: TicketInsight[] } | { error: string };

export function ClientAutotaskTickets({
  companyId,
  tickets,
  detailAction,
  analyzeAction,
}: {
  companyId: number | null;
  tickets: AutotaskTicketRow[];
  detailAction: (ticketId: number) => Promise<TicketDetail>;
  analyzeAction: () => Promise<AnalyzeResult>;
}) {
  const [insights, setInsights] = useState<Map<number, TicketInsight> | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();

  const runAnalysis = () => {
    setAnalyzeError(null);
    startAnalyze(async () => {
      const result = await analyzeAction();
      if ("error" in result) {
        setAnalyzeError(result.error);
        return;
      }
      setInsights(new Map(result.insights.map((i) => [i.ticketId, i])));
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Tickets</h2>
        {companyId !== null && tickets.length > 0 && (
          <div className="flex items-center gap-2">
            {insights && (
              <span className="text-xs text-slate-500">
                {insights.size > 0
                  ? `${insights.size} ticket${insights.size === 1 ? "" : "s"} flagged`
                  : "Nothing notable found"}
              </span>
            )}
            <button
              type="button"
              onClick={runAnalysis}
              disabled={analyzing}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {analyzing ? "Analyzing…" : "Analyze tickets"}
            </button>
          </div>
        )}
      </div>
      {analyzeError && (
        <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-xs text-red-600">
          {analyzeError}
        </p>
      )}
      <div className="divide-y divide-slate-100">
        {companyId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Autotask using the button at the top of the page to see its tickets
            here.
          </p>
        ) : (
          <>
            {tickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                detailAction={detailAction}
                insight={insights?.get(t.id) ?? null}
              />
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
  insight,
}: {
  ticket: AutotaskTicketRow;
  detailAction: (ticketId: number) => Promise<TicketDetail>;
  insight: TicketInsight | null;
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
          {insight?.keyPoint && (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Key point:</span> {insight.keyPoint}
            </p>
          )}
          {insight?.pendingAction && (
            <p className="mt-1 text-xs text-amber-700">
              <span className="font-medium">Pending:</span> {insight.pendingAction}
            </p>
          )}
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