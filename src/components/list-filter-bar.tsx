"use client";

import { IconSearch } from "@/components/icons";

export type FilterToggle = { value: string; label: string };

// The filter row inside a Services & Devices card. Unlike the page-level
// filters (URL params, filtered in the query), these lists are already fully
// loaded as props, so filtering is local state — instant, and no round trip
// to hide a row that's already on the client.
export function ListFilterBar({
  query,
  onQueryChange,
  placeholder,
  toggles = [],
  activeToggle,
  onToggle,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  toggles?: FilterToggle[];
  activeToggle?: string | null;
  onToggle?: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-48 rounded-md border border-slate-300 bg-white py-1 pl-8 pr-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {toggles.map((t) => {
        const active = activeToggle === t.value;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle?.(active ? null : t.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-charcoal text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Case-insensitive "does any of these fields contain the query" test. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
