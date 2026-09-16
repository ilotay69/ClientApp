"use client";

import { useState } from "react";
import { NewQuarterlyReviewForm } from "@/components/new-quarterly-review-form";
import type { AutotaskQuarterlyReviewTicket } from "@/lib/autotask";
import type { QuarterlyReviewSlaTicketRow } from "@/lib/quarterly-review-data";
import type { QuarterlyReviewTemplateKey } from "@/lib/quarterly-review-sections";

/** Collapsed by default — decluttering the main page down to just the
 * client picker and existing-reviews list until staff actually want to
 * start one. Underneath the button sits every open "Quarterly Reviews
 * SLA" ticket assigned to the current tech (see
 * fetchOpenQuarterlyReviewSlaTicketsForDisplay) — pick one with its radio
 * button and click "Start with Autotask ticket" to open the form already
 * pre-filled with that ticket's client/number/hours, no need to pick a
 * client or identify the ticket a second time. */
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
  // internal state from whichever ticket was selected before.
  const [prefill, setPrefill] = useState<QuarterlyReviewSlaTicketRow | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

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

  function startWithSelectedTicket() {
    const row = slaTickets.find((t) => t.ticketId === selectedTicketId);
    if (!row) return;
    setPrefill(row);
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={openBlank}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
      >
        {open && !prefill ? "Cancel" : "+ New Review"}
      </button>

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-900">Open Quarterly Review Tickets</h2>
          <p className="text-xs text-slate-500">
            Open Autotask tickets on the Quarterly SLA assigned to you — pick one and start
            its review, no need to identify the client or ticket again.
          </p>
        </div>
        {slaTickets.length === 0 ? (
          <p className="px-4 py-4 text-center text-xs text-slate-500">
            No open Quarterly SLA tickets assigned to you right now.
          </p>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {slaTickets.map((t) => (
                <label
                  key={t.ticketId}
                  className="flex cursor-pointer items-start justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="sla_ticket"
                      className="mt-1"
                      checked={selectedTicketId === t.ticketId}
                      onChange={() => setSelectedTicketId(t.ticketId)}
                    />
                    <span>
                      <span className="font-medium text-slate-900">{t.clientName}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="text-slate-700">
                        {t.ticketNumber ? `#${t.ticketNumber} — ` : ""}
                        {t.title}
                      </span>
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-400">{t.hoursLogged.toFixed(1)} hrs logged</span>
                </label>
              ))}
            </div>
            <div className="border-t border-slate-200 px-4 py-2.5">
              <button
                type="button"
                onClick={startWithSelectedTicket}
                disabled={selectedTicketId === null}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                Start with Autotask ticket
              </button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
