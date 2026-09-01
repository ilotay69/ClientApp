"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type { AutotaskCompany, AutotaskTicketNote, AutotaskTimeEntry } from "@/lib/autotask";

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
  searchAction,
  linkAction,
  unlinkAction,
  syncAction,
  detailAction,
}: {
  companyId: number | null;
  tickets: AutotaskTicketRow[];
  searchAction: (query: string) => Promise<{ companies: AutotaskCompany[] } | { error: string }>;
  linkAction: (companyId: number) => Promise<void>;
  unlinkAction: () => Promise<void>;
  syncAction: () => Promise<{ error: string | null }>;
  detailAction: (ticketId: number) => Promise<TicketDetail>;
}) {
  const [showMapping, setShowMapping] = useState(companyId === null);
  const [syncing, startSync] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  if (!showMapping && companyId !== null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Tickets</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={syncing}
              onClick={() =>
                startSync(async () => {
                  const result = await syncAction();
                  setSyncError(result.error);
                })
              }
              className="text-xs text-slate-500 hover:underline disabled:opacity-60"
            >
              {syncing ? "Syncing..." : "Sync now"}
            </button>
            <button
              type="button"
              onClick={() => setShowMapping(true)}
              className="text-xs text-slate-500 hover:underline"
            >
              Change mapping
            </button>
          </div>
        </div>
        {syncError && <p className="px-5 pt-3 text-sm text-red-600">{syncError}</p>}
        <div className="divide-y divide-slate-100">
          {tickets.map((t) => (
            <TicketRow key={t.id} ticket={t} detailAction={detailAction} />
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
