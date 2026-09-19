// Client-safe: imported by both server pages and the "use client" filter
// bar, so nothing server-only may ever be imported here (same rule as
// lib/portal-roles.ts).

import type { PortalPageKey } from "@/lib/portal-roles";

/**
 * Portal filters live in the URL, not in component state.
 *
 * That is the whole reason the CSV/PDF downloads can honour "match the
 * filters the client selected" without a second filtering implementation:
 * the page reads its filters from searchParams, and the download button is
 * a plain link carrying those same searchParams to the export route, which
 * runs the same fetch-and-filter function the page just ran. There is no
 * path by which the file and the screen can disagree, because there is only
 * one filter implementation and one source of filter values.
 *
 * Values are always strings (that is what a URL holds); each section's own
 * fetcher is responsible for interpreting them.
 */
export type PortalFilters = Record<string, string>;

/** Per-section allow-list of filter keys. Anything not listed is dropped
 * rather than passed through — a filter the section doesn't understand is
 * either a typo or someone poking at the URL, and silently ignoring it
 * beats carrying it into a query. */
export const PORTAL_FILTER_KEYS: Record<PortalPageKey, readonly string[]> = {
  tickets: ["q", "status", "priority", "days"],
  licences: ["q", "usage", "showLarge"],
  contracts: ["q", "resource", "from", "to"],
  devices: ["q", "status", "class", "os"],
  huntress: ["q", "status", "platform"],
  fortigate: ["q", "support"],
  mailbox: ["q", "usage"],
  domain: [],
  reviews: [],
  onboarding: [],
};

/** Reads only the keys this section declares, dropping blanks so an empty
 * select doesn't produce `?status=` noise in every link. */
export function readPortalFilters(
  section: PortalPageKey,
  params: Record<string, string | string[] | undefined>
): PortalFilters {
  const filters: PortalFilters = {};
  for (const key of PORTAL_FILTER_KEYS[section]) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.trim() !== "") filters[key] = value.trim();
  }
  return filters;
}

/** Builds a URLSearchParams carrying the filters, the staff `preview` id if
 * there is one, and any overrides. Sorted so two equivalent filter sets
 * produce byte-identical URLs, which keeps Next's router from treating a
 * re-ordered query string as a new destination. */
export function portalSearchParams(
  filters: PortalFilters,
  preview: string | undefined,
  overrides: Record<string, string | null> = {}
): URLSearchParams {
  const merged: PortalFilters = { ...filters };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === "") delete merged[key];
    else merged[key] = value;
  }

  const params = new URLSearchParams();
  for (const key of Object.keys(merged).sort()) params.set(key, merged[key]);
  if (preview) params.set("preview", preview);
  return params;
}

/** A link back to the same page with one filter changed. */
export function portalFilterHref(
  basePath: string,
  filters: PortalFilters,
  preview: string | undefined,
  overrides: Record<string, string | null>
): string {
  const params = portalSearchParams(filters, preview, overrides);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** A link to the export route for this section, in this format, carrying
 * exactly the filters currently applied on screen. */
export function portalExportHref(
  section: PortalPageKey,
  format: "csv" | "pdf",
  filters: PortalFilters,
  preview: string | undefined
): string {
  const params = portalSearchParams(filters, preview, { section, format });
  return `/api/portal/export?${params.toString()}`;
}

/** Case-insensitive "does any of these fields contain the search text".
 * Used by every section's `q` filter so free-text search behaves the same
 * everywhere rather than each page inventing its own rule. */
export function matchesQuery(query: string | undefined, fields: (string | null | undefined)[]): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}
