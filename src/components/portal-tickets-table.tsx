"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import { EmptyRow } from "@/components/portal-ui";
import type { PortalTicketListItem } from "@/lib/portal-data";
import {
  fetchTicketCommunicationAction,
  type TicketCommunicationResult,
} from "@/app/portal/tickets/actions";
import type { AutotaskClientTicketNote } from "@/lib/autotask";

export function PortalTicketsTable({ tickets }: { tickets: PortalTicketListItem[] }) {
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") ?? undefined;

  if (tickets.length === 0) return <EmptyRow>No tickets match these filters.</EmptyRow>;
  return (
    <div className="divide-y divide-slate-100">
      {tickets.map((t) => (
        <TicketRow key={t.id} ticket={t} preview={preview} />
      ))}
    </div>
  );
}

/**
 * Everything except correspondence is already in the array passed down at
 * initial render (see fetchPortalTicketList), so expanding is instant for
 * the description, resolution and billable time.
 *
 * Notes are the exception and are fetched on first expand: they cost one
 * Autotask call per ticket, and only the customer-visible ones are ever
 * returned — see fetchClientVisibleTicketNotes, which resolves Autotask's
 * `publish` picklist by label and returns nothing at all if it cannot
 * establish which values mean customer-facing. Internal engineer notes
 * never reach this component.
 *
 * Deliberately absent: rates, charges, and anything else priced. Billable
 * HOURS are shown because a client drawing down a prepaid block needs to
 * see where the hours went; what those hours cost is a billing
 * conversation, not a portal one.
 */
function TicketRow({ ticket, preview }: { ticket: PortalTicketListItem; preview?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
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
        <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-5 py-4">
          {ticket.description && (
            <Block title="Description">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p>
            </Block>
          )}
          {ticket.resolution && (
            <Block title="Resolution">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{ticket.resolution}</p>
            </Block>
          )}

          <TicketCommunication ticketId={ticket.id} preview={preview} />

          <Block
            title={`Time logged${
              ticket.billableTimeEntries.length > 0
                ? ` (${ticket.billableTimeEntries.reduce((s, e) => s + e.hoursWorked, 0).toFixed(2)} hrs)`
                : ""
            }`}
          >
            {ticket.billableTimeEntries.length === 0 ? (
              <p className="text-sm text-slate-500">No time logged yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
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
          </Block>

          {ticket.lastActivityAt && (
            <p className="text-xs text-slate-400">
              Last activity {formatDate(ticket.lastActivityAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TicketCommunication({ ticketId, preview }: { ticketId: number; preview?: string }) {
  const [state, setState] = useState<"loading" | "done">("loading");
  const [notes, setNotes] = useState<AutotaskClientTicketNote[]>([]);
  const [error, setError] = useState<string | null>(null);

  // No setState("loading") here: this component is mounted fresh each time
  // a row is expanded, so "loading" is already the initial state.
  useEffect(() => {
    let cancelled = false;
    fetchTicketCommunicationAction(ticketId, preview)
      .then((result: TicketCommunicationResult) => {
        if (cancelled) return;
        if ("error" in result) setError(result.error);
        else setNotes(result.notes);
        setState("done");
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load this ticket's updates right now.");
        setState("done");
      });
    // Cancelled rather than left to resolve into an unmounted row: a client
    // can collapse and re-expand faster than Autotask answers.
    return () => {
      cancelled = true;
    };
  }, [ticketId, preview]);

  return (
    <Block title="Updates">
      {state === "loading" ? (
        <p className="text-sm text-slate-400">Loading updates…</p>
      ) : error ? (
        <p className="text-sm text-slate-500">{error}</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-slate-500">No updates have been shared on this ticket yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {notes.map((n) => (
            <div key={n.id} className="px-3 py-2 text-sm">
              {n.title && <p className="font-medium text-slate-900">{n.title}</p>}
              <p className="whitespace-pre-wrap text-slate-700">{n.description}</p>
              <p className="mt-1 text-xs text-slate-400">
                {formatDate(n.createdAt)}
                {n.creatorName ? ` · ${n.creatorName}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </Block>
  );
}
