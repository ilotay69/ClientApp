"use client";

import { useEffect, useState } from "react";
import { IconAlertTriangle } from "@/components/icons";
import type { ForticloudDeviceRow } from "@/lib/forticloud-lookups";

type ActionResult = { rows: ForticloudDeviceRow[] } | { error: string };

/** Live from FortiCloud, fetched client-side after the rest of the
 * Dashboard has already rendered — same lazy-fetch reasoning as
 * TeamHoursWidget/Level1QueueWidget, since this hits an external API per
 * FortiCloud account on file rather than reading anything cached. */
export function ForticloudExpiringWidget({ action }: { action: () => Promise<ActionResult> }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    action().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = state && "rows" in state ? state.rows : [];
  const visible = showAll ? rows : rows.slice(0, 5);

  return (
    <div className="relative rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-white shadow-sm transition-shadow hover:shadow-md">
      {state && "rows" in state && rows.length > 0 && (
        <span
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow ring-2 ring-white"
          title="Needs attention"
          aria-hidden="true"
        >
          !
        </span>
      )}
      <div className="flex items-center justify-between gap-2.5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
            <IconAlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">FortiCloud Devices Expiring</p>
            <p className="truncate text-xs font-medium text-red-700/70">expired or within 30 days</p>
          </div>
        </div>
        <span className="shrink-0 text-3xl font-bold tabular-nums text-red-600">
          {state && "rows" in state ? rows.length : "—"}
        </span>
      </div>
      <div className="mx-2 mb-2 overflow-hidden rounded-xl bg-white/80 ring-1 ring-slate-100">
        {!state ? (
          <p className="px-4 py-2 text-sm text-slate-500">Loading from FortiCloud…</p>
        ) : "error" in state ? (
          <p className="px-4 py-2 text-sm text-red-600">{state.error}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-2 text-sm text-slate-500">Nothing expired or expiring soon.</p>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {visible.map((r) => (
                <div key={`${r.accountLabel}-${r.serialNumber}`} className="flex items-center gap-2.5 px-4 py-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      r.supportStatus === "expired" ? "bg-red-500" : "bg-amber-400"
                    }`}
                  />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {r.productModel}
                        {r.description ? ` — ${r.description}` : ""}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {r.accountLabel} · {r.serialNumber}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        r.supportStatus === "expired" ? "text-red-600" : "text-amber-600"
                      }`}
                    >
                      {r.supportStatus === "expired" ? "Expired" : "Expires"}{" "}
                      {r.supportEndDate ? r.supportEndDate.slice(0, 10) : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {rows.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="w-full border-t border-slate-100 px-4 py-2 text-left text-xs font-medium text-brand hover:underline"
              >
                {showAll ? "Show fewer" : `Show ${rows.length - 5} more`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
