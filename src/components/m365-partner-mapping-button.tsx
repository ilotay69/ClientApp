"use client";

import { useState, useTransition } from "react";
import type { M365Customer } from "@/lib/m365-partner";

export function M365PartnerMappingButton({
  tenantId,
  searchAction,
  linkAction,
  unlinkAction,
}: {
  tenantId: string | null;
  searchAction: (query: string) => Promise<{ customers: M365Customer[] } | { error: string }>;
  linkAction: (tenantId: string) => Promise<void>;
  unlinkAction: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<M365Customer[]>([]);
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
        setResults(result.customers);
      }
    });
  };

  const close = () => {
    setExpanded(false);
    setQuery("");
    setResults([]);
    setError(null);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        {tenantId !== null ? "Change M365 mapping" : "Link to M365"}
      </button>

      {expanded && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="text-sm text-slate-500">
            Search for this client&apos;s Microsoft 365 tenant (must have an active GDAP
            relationship).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Tenant name"
              autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-100">
              {results.map((c) => (
                <li key={c.tenantId} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-slate-900">{c.displayName}</span>
                  <button
                    type="button"
                    disabled={linking}
                    onClick={() =>
                      startLink(async () => {
                        await linkAction(c.tenantId);
                        close();
                      })
                    }
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    Link
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={close} className="text-xs text-slate-500 hover:underline">
              Close
            </button>
            {tenantId !== null && (
              <button
                type="button"
                disabled={linking}
                onClick={() =>
                  startLink(async () => {
                    await unlinkAction();
                    close();
                  })
                }
                className="text-xs text-red-600 hover:underline disabled:opacity-60"
              >
                Remove mapping
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
