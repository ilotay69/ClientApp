"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PORTAL_FILTER_KEYS,
  portalExportHref,
  portalSearchParams,
  type PortalFilters,
} from "@/lib/portal-filters";
import type { PortalPageKey } from "@/lib/portal-roles";
import { IconDownload, IconSearch, IconX } from "@/components/icons";

export type FilterSelect = {
  /** Must be one of PORTAL_FILTER_KEYS[section] or the value is dropped
   * on the way into the URL and the control appears to do nothing. */
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
};

/**
 * Filters live in the URL rather than in this component's state.
 *
 * That is deliberate and load-bearing: the download links below are built
 * from the very same query string, so "the CSV matches what I filtered" is
 * structural rather than something two code paths have to agree about. It
 * also means a filtered view is a shareable link and survives a refresh.
 */
export function PortalFilterBar({
  section,
  searchPlaceholder,
  selects = [],
  downloads = { csv: true, pdf: false },
  resultLabel,
  children,
}: {
  section: PortalPageKey;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  downloads?: { csv: boolean; pdf: boolean };
  /** e.g. "18 of 340 devices" — rendered next to the controls so the effect
   * of a filter is always visible, including when it hides everything. */
  resultLabel?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const preview = searchParams.get("preview") ?? undefined;

  // Only this section's own declared keys, so a stale parameter left over
  // from another page can't ride along into a download.
  const filters = useMemo(() => {
    const next: PortalFilters = {};
    for (const key of PORTAL_FILTER_KEYS[section]) {
      const value = searchParams.get(key);
      if (value && value.trim() !== "") next[key] = value.trim();
    }
    return next;
  }, [searchParams, section]);

  const [search, setSearch] = useState(filters.q ?? "");

  // Keeps the box in step when the URL changes from somewhere else (a Clear
  // press, the back button) without fighting the user mid-keystroke.
  // Adjusted during render rather than in an effect — React's own
  // documented pattern for deriving state from a changed input, and it
  // avoids the extra commit-then-rerender an effect would cost on every
  // navigation.
  const [lastAppliedQuery, setLastAppliedQuery] = useState(filters.q ?? "");
  if (lastAppliedQuery !== (filters.q ?? "")) {
    setLastAppliedQuery(filters.q ?? "");
    setSearch(filters.q ?? "");
  }

  const apply = (overrides: Record<string, string | null>) => {
    const params = portalSearchParams(filters, preview, overrides);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounced so typing doesn't fire a server round-trip per character.
  useEffect(() => {
    const current = filters.q ?? "";
    if (search === current) return;
    const timer = setTimeout(() => apply({ q: search || null }), 350);
    return () => clearTimeout(timer);
    // apply/filters are recreated each render; the guard above is what
    // actually prevents a loop, not the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {searchPlaceholder && (
          <div className="relative min-w-50 flex-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
            />
          </div>
        )}

        {selects.map((select) => (
          <label key={select.key} className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500">{select.label}</span>
            <select
              value={filters[select.key] ?? ""}
              onChange={(e) => apply({ [select.key]: e.target.value || null })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand focus:outline-none"
            >
              <option value="">All</option>
              {select.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.count !== undefined ? ` (${o.count})` : ""}
                </option>
              ))}
            </select>
          </label>
        ))}

        {children}

        {hasFilters && (
          <button
            type="button"
            onClick={() => apply(Object.fromEntries(Object.keys(filters).map((k) => [k, null])))}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <IconX className="h-3.5 w-3.5" />
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {resultLabel && <span className="text-xs text-slate-500">{resultLabel}</span>}
          {downloads.csv && (
            <DownloadLink href={portalExportHref(section, "csv", filters, preview)} label="CSV" />
          )}
          {downloads.pdf && (
            <DownloadLink href={portalExportHref(section, "pdf", filters, preview)} label="PDF" />
          )}
        </div>
      </div>
    </div>
  );
}

/** A plain anchor, not a fetch-and-blob: the route already sends
 * Content-Disposition: attachment, so the browser saves it with the right
 * filename and shows its own download progress for a slow report. */
function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <IconDownload className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
