"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { FormState, AutotaskQuoteOption } from "@/app/(dashboard)/clients/actions";

/** Lists a client's Autotask quotes (via their Opportunities — Quotes have
 * no direct company filter) and logs a chosen one to that client's
 * Timeline as a reference (name/number/status/dates + a "View in
 * Autotask" link) — not a document, since Autotask's Quotes API has no
 * PDF/portal link of its own. Used from a project's row, since quotes
 * aren't tied to a specific project in this app's own data model, only
 * to the client. */
export function AutotaskQuotePicker({
  listAutotaskQuotesAction,
  logAutotaskQuoteAction,
}: {
  listAutotaskQuotesAction: () => Promise<{ quotes: AutotaskQuoteOption[] } | { error: string }>;
  logAutotaskQuoteAction: (quote: AutotaskQuoteOption) => Promise<FormState>;
}) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<AutotaskQuoteOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [loggingId, setLoggingId] = useState<number | null>(null);
  const [loggedIds, setLoggedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    startLoad(async () => {
      const result = await listAutotaskQuotesAction();
      if ("error" in result) setError(result.error);
      else setQuotes(result.quotes);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logQuote = (quote: AutotaskQuoteOption) => {
    setError(null);
    setLoggingId(quote.id);
    startLoad(async () => {
      const result = await logAutotaskQuoteAction(quote);
      setLoggingId(null);
      if (result.error) setError(result.error);
      else {
        setLoggedIds((prev) => new Set(prev).add(quote.id));
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Logs a reference to an existing Autotask quote (name, number, status, dates) to this
        client&apos;s Timeline, with a link back to it — not a document, since Autotask has no PDF
        for a quote to fetch.
      </p>
      {loading && quotes === null && (
        <p className="text-sm text-slate-500">Loading Autotask quotes…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {quotes && quotes.length === 0 && (
        <p className="text-sm text-slate-500">No Autotask quotes found for this client.</p>
      )}
      {quotes && quotes.length > 0 && (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
          {quotes.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{q.name}</p>
                <p className="text-xs text-slate-500">
                  {[
                    q.quoteNumber ? `#${q.quoteNumber}` : null,
                    q.approvalStatus,
                    q.effectiveDate ? formatDate(q.effectiveDate) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => logQuote(q)}
                disabled={loggingId === q.id || loggedIds.has(q.id)}
                className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {loggingId === q.id ? "Logging…" : loggedIds.has(q.id) ? "Logged" : "Log this quote"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
