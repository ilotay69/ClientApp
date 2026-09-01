"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type { AutotaskCompany } from "@/lib/autotask";

export type AutotaskTicketRow = {
  id: number;
  ticket_number: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  queue_name: string | null;
  assigned_resource_name: string | null;
  due_date: string | null;
};

export function ClientAutotaskTickets({
  companyId,
  tickets,
  searchAction,
  linkAction,
  unlinkAction,
}: {
  companyId: number | null;
  tickets: AutotaskTicketRow[];
  searchAction: (query: string) => Promise<{ companies: AutotaskCompany[] } | { error: string }>;
  linkAction: (companyId: number) => Promise<void>;
  unlinkAction: () => Promise<void>;
}) {
  const [showMapping, setShowMapping] = useState(companyId === null);

  if (!showMapping && companyId !== null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Tickets</h2>
          <button
            type="button"
            onClick={() => setShowMapping(true)}
            className="text-xs text-slate-500 hover:underline"
          >
            Change mapping
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {t.ticket_number ? `#${t.ticket_number} — ` : ""}
                  {t.title}
                </p>
                <p className="text-xs text-slate-500">
                  {t.assigned_resource_name ? `Assigned to ${t.assigned_resource_name}` : "Unassigned"}
                  {t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.priority && <Badge value={t.priority} />}
                {t.status && <Badge value={t.status} />}
              </div>
            </div>
          ))}
          {tickets.length === 0 && (
            <p className="px-5 py-4 text-sm text-slate-500">
              No open tickets for this client right now.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <LinkAutotaskCompany
      hasExistingMapping={companyId !== null}
      onCancel={companyId !== null ? () => setShowMapping(false) : undefined}
      searchAction={searchAction}
      linkAction={async (id) => {
        await linkAction(id);
        setShowMapping(false);
      }}
      unlinkAction={async () => {
        await unlinkAction();
      }}
    />
  );
}

function LinkAutotaskCompany({
  hasExistingMapping,
  onCancel,
  searchAction,
  linkAction,
  unlinkAction,
}: {
  hasExistingMapping: boolean;
  onCancel?: () => void;
  searchAction: (query: string) => Promise<{ companies: AutotaskCompany[] } | { error: string }>;
  linkAction: (companyId: number) => Promise<void>;
  unlinkAction: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AutotaskCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [linking, startLink] = useTransition();

  const runSearch = () => {
    setError(null);
    startSearch(async () => {
      const result = await searchAction(query);
      if ("error" in result) {
        setError(result.error);
        setResults([]);
      } else {
        setResults(result.companies);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Link to Autotask</h2>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-sm text-slate-500">
          Search for this client&apos;s Autotask company to show its open tickets here.
        </p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Company name"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching || !query.trim()}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {results.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
            {results.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm text-slate-900">{c.companyName}</span>
                <button
                  type="button"
                  disabled={linking}
                  onClick={() => startLink(() => linkAction(c.id))}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Link
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:underline">
              Cancel
            </button>
          )}
          {hasExistingMapping && (
            <button
              type="button"
              onClick={() => startLink(unlinkAction)}
              className="text-xs text-red-600 hover:underline"
            >
              Remove mapping
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
