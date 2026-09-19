"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { portalSearchParams, PORTAL_FILTER_KEYS, type PortalFilters } from "@/lib/portal-filters";

/** From/to date inputs that write into the same URL query the rest of the
 * filter bar uses, so a date-narrowed view downloads as a date-narrowed
 * file. Rendered as a child of PortalFilterBar rather than built into it,
 * since only the contract section has a date range worth filtering on. */
export function PortalDateRange() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") ?? undefined;

  const filters: PortalFilters = {};
  for (const key of PORTAL_FILTER_KEYS.contracts) {
    const value = searchParams.get(key);
    if (value && value.trim() !== "") filters[key] = value.trim();
  }

  const apply = (key: "from" | "to", value: string) => {
    const params = portalSearchParams(filters, preview, { [key]: value || null });
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-slate-500">From</span>
      <input
        type="date"
        value={filters.from ?? ""}
        onChange={(e) => apply("from", e.target.value)}
        aria-label="Time entries from"
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand focus:outline-none"
      />
      <span className="text-slate-500">to</span>
      <input
        type="date"
        value={filters.to ?? ""}
        onChange={(e) => apply("to", e.target.value)}
        aria-label="Time entries to"
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand focus:outline-none"
      />
    </div>
  );
}
