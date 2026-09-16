"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SearchableClientSelect } from "@/components/searchable-client-select";
import type { AutotaskQuarterlyReviewTicket } from "@/lib/autotask";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Month/year dropdowns rather than a free-text period field — guarantees
 * every review is labeled in the same "{Month} {Year}" format (matching
 * the existing "April 2026" style already used in past reviews) instead
 * of staff typing something like "Apr 2026" or "2026 April" that would
 * read inconsistently in the reviews list. clientId is pre-selected when
 * arriving with ?client_id= already in the URL, but this is a standalone
 * create form either way. */
export function NewQuarterlyReviewForm({
  clients,
  defaultClientId,
  action,
  fetchOpenTicketsAction,
  initialTicket,
}: {
  clients: { id: string; name: string }[];
  defaultClientId: string | null;
  action: (
    clientId: string,
    reviewPeriod: string,
    confirmDuplicate: boolean,
    ticketNumber: string | null,
    hoursSpent: number | null
  ) => Promise<{ error: string } | undefined>;
  fetchOpenTicketsAction: (
    clientId: string
  ) => Promise<{ rows: AutotaskQuarterlyReviewTicket[] } | { error: string }>;
  /** Pre-picked from the "open Quarterly Reviews SLA tickets" list on the
   * main page — when set, the per-client Autotask lookup below is skipped
   * on mount (this ticket is trusted instead) so the tech isn't asked to
   * identify the ticket a second time. Changing the client afterward still
   * falls back to the normal per-client search, same as a manually opened
   * blank form. */
  initialTicket?: AutotaskQuarterlyReviewTicket | null;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(String(currentYear));
  const [pending, startTransition] = useTransition();
  const [warning, setWarning] = useState<string | null>(null);

  // The client's open "quarterly review" recurring tickets — re-fetched
  // every time the selected client changes, so switching clients never
  // shows a stale list from whoever was selected before. Pre-seeded from
  // initialTicket (the SLA-tickets list on the main page) when given, so
  // the very first render already has its answer instead of showing a
  // "checking Autotask..." flash for a ticket the tech already picked.
  const [tickets, setTickets] = useState<AutotaskQuarterlyReviewTicket[] | null>(
    initialTicket ? [initialTicket] : null
  );
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [loadingTickets, startLoadingTickets] = useTransition();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(initialTicket?.id ?? null);
  // Skips the very first effect run when we already trust initialTicket —
  // every later clientId change (the tech picking a different client by
  // hand) still runs the normal per-client Autotask search.
  const skipNextFetch = useRef(!!initialTicket);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    setTickets(null);
    setTicketsError(null);
    setSelectedTicketId(null);
    if (!clientId) return;
    startLoadingTickets(async () => {
      const result = await fetchOpenTicketsAction(clientId);
      if ("error" in result) {
        setTicketsError(result.error);
      } else {
        setTickets(result.rows);
        // Exactly one candidate — pick it automatically, since that's the
        // common case and a tech would just click it anyway.
        if (result.rows.length === 1) setSelectedTicketId(result.rows[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const selectedTicket = tickets?.find((t) => t.id === selectedTicketId) ?? null;

  function run(confirmDuplicate: boolean) {
    if (!clientId) return;
    const period = `${month} ${year}`;
    setWarning(null);
    startTransition(async () => {
      const result = await action(
        clientId,
        period,
        confirmDuplicate,
        selectedTicket?.ticketNumber ?? null,
        selectedTicket ? selectedTicket.hoursLogged : null
      );
      // No result at all means createQuarterlyReviewAction hit its own
      // redirect() — there's nothing left to show here either way.
      if (result?.error) setWarning(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <label className="block text-xs font-medium text-slate-700">Client</label>
          <div className="mt-1">
            <SearchableClientSelect
              clients={clients}
              value={clientId || null}
              onChange={(id) => {
                setClientId(id);
                setWarning(null);
              }}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Month</label>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setWarning(null);
            }}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Year</label>
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setWarning(null);
            }}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending || !clientId}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Starting…" : "Start review"}
        </button>
      </div>

      {clientId && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          {loadingTickets && <p className="text-xs text-slate-500">Checking Autotask for an open quarterly review ticket…</p>}
          {ticketsError && <p className="text-xs text-red-600">{ticketsError}</p>}
          {!loadingTickets && !ticketsError && tickets && tickets.length === 0 && (
            <p className="text-xs text-slate-500">
              No open quarterly review ticket found for this client — ticket # and hours can be
              filled in later on the review's own page.
            </p>
          )}
          {!loadingTickets && !ticketsError && tickets && tickets.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">
                Which ticket is this review for?
              </p>
              <div className="space-y-1">
                {tickets.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                    <input
                      type="radio"
                      name="quarterly_review_ticket"
                      checked={selectedTicketId === t.id}
                      onChange={() => setSelectedTicketId(t.id)}
                      className="mt-0.5"
                    />
                    <span>
                      {t.ticketNumber ? `#${t.ticketNumber} — ` : ""}
                      {t.title}
                      <span className="text-slate-400"> · {t.hoursLogged.toFixed(1)} hrs logged so far</span>
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                  <input
                    type="radio"
                    name="quarterly_review_ticket"
                    checked={selectedTicketId === null}
                    onChange={() => setSelectedTicketId(null)}
                  />
                  None of these / decide later
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {warning && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warning}{" "}
          <button
            type="button"
            onClick={() => run(true)}
            disabled={pending}
            className="font-medium underline disabled:opacity-60"
          >
            Create it anyway
          </button>
        </div>
      )}
    </div>
  );
}
