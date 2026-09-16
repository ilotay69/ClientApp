"use client";

import { useState } from "react";
import { NewQuarterlyReviewForm } from "@/components/new-quarterly-review-form";
import type { AutotaskQuarterlyReviewTicket } from "@/lib/autotask";
import type { QuarterlyReviewSlaTicketRow } from "@/lib/quarterly-review-data";
import type { QuarterlyReviewTemplateKey } from "@/lib/quarterly-review-sections";

/** Collapsed by default — decluttering the main page down to just the
 * client picker and existing-reviews list until staff actually want to
 * start one. Also surfaces every open "Quarterly Reviews SLA" ticket
 * across all clients — clicking one opens the form already pre-filled
 * with that ticket's client/number/hours, so the tech isn't asked to pick
 * a client or identify the ticket a second time. */
export function NewReviewPanel({
  clients,
  defaultClientId,
  action,
  fetchOpenTicketsAction,
  slaTickets,
}: {
  clients: { id: string; name: string }[];
  defaultClientId: string | null;
  action: (
    clientId: string,
    reviewPeriod: string,
    confirmDuplicate: boolean,
    ticketNumber: string | null,
    hoursSpent: number | null,
    template: QuarterlyReviewTemplateKey
  ) => Promise<{ error: string } | undefined>;
  fetchOpenTicketsAction: (
    clientId: string
  ) => Promise<{ rows: AutotaskQuarterlyReviewTicket[] } | { error: string }>;
  slaTickets: QuarterlyReviewSlaTicketRow[];
}) {
  const [open, setOpen] = useState(false);
  // Which SLA ticket (if any) seeded the currently-open form — included in
  // the form's key below so picking a different ticket while the panel is
  // already open remounts it with fresh state instead of reusing stale
  // internal state from whichever ticket was clicked before.
  const [prefill, setPrefill] = useState<QuarterlyReviewSlaTicketRow | null>(null);

  function openBlank() {
    // Already showing a blank form — this click means "Cancel", close it.
    // Otherwise (closed, or open with a ticket's prefill) it means "start a
    // blank one", switching away from any prefill rather than closing.
    if (open && !prefill) {
      setOpen(false);
    } else {
      setPrefill(null);
      setOpen(true);
    }
  }

  function openForTicket(row: QuarterlyReviewSlaTicketRow) {
    setPrefill(row);
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      {slaTickets.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-900">Open Quarterly Review Tickets</h2>
            <p className="text-xs text-slate-500">
              Every open Autotask ticket on the Quarterly Reviews SLA — click one to start its review
              pre-filled, no need to pick the client or ticket again.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {slaTickets.map((t) => (
              <button
                key={t.ticketId}
                type="button"
                onClick={() => openForTicket(t)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
              >
                <div>
                  <span className="font-medium text-slate-900">{t.clientName}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-700">{t.ticketNumber ? `#${t.ticketNumber} — ` : ""}{t.title}</span>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-400">{t.hoursLogged.toFixed(1)} hrs logged</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={openBlank}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
      >
        {open && !prefill ? "Cancel" : "+ New Review"}
      </button>
      {open && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <NewQuarterlyReviewForm
            key={prefill ? `ticket-${prefill.ticketId}` : "manual"}
            clients={clients}
            defaultClientId={prefill?.clientId ?? defaultClientId}
            action={action}
            fetchOpenTicketsAction={fetchOpenTicketsAction}
            initialTicket={
              prefill
                ? { id: prefill.ticketId, ticketNumber: prefill.ticketNumber, title: prefill.title, createdAt: null, hoursLogged: prefill.hoursLogged }
                : null
            }
          />
        </div>
      )}
    </div>
  );
}
