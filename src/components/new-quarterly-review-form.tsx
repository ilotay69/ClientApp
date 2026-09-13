"use client";

import { useState, useTransition } from "react";

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
}: {
  clients: { id: string; name: string }[];
  defaultClientId: string | null;
  action: (
    clientId: string,
    reviewPeriod: string,
    confirmDuplicate: boolean
  ) => Promise<{ error: string } | undefined>;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(String(currentYear));
  const [pending, startTransition] = useTransition();
  const [warning, setWarning] = useState<string | null>(null);

  function run(confirmDuplicate: boolean) {
    if (!clientId) return;
    const period = `${month} ${year}`;
    setWarning(null);
    startTransition(async () => {
      const result = await action(clientId, period, confirmDuplicate);
      // No result at all means createQuarterlyReviewAction hit its own
      // redirect() — there's nothing left to show here either way.
      if (result?.error) setWarning(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">Client</label>
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setWarning(null);
            }}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
