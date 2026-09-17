"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconClock } from "@/components/icons";
import type { ResourceHoursRow } from "@/lib/resource-hours";

type ActionResult =
  | { rows: ResourceHoursRow[]; todayDate: string; yesterdayDate: string }
  | { error: string };

/** Live from Autotask, fetched client-side after the rest of the Dashboard
 * has already rendered — this is the one widget that can't just come back
 * with the page's own Supabase queries (fetchResourceHoursSummary hits
 * Autotask directly, same as the Reports page's "Resource hours" tab), so
 * it gets its own loading state instead of blocking the whole page on an
 * external API call. */
export function TeamHoursWidget({ action }: { action: () => Promise<ActionResult> }) {
  const [state, setState] = useState<ActionResult | null>(null);

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

  const rows = state && "rows" in state ? [...state.rows].sort((a, b) => b.thisMonth - a.thisMonth).slice(0, 8) : [];
  const maxMonth = Math.max(1, ...rows.map((r) => r.thisMonth));
  const totalMonth = rows.reduce((sum, r) => sum + r.thisMonth, 0);

  return (
    <div className="relative rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-white shadow-sm transition-shadow hover:shadow-md">
      <Link href="/reports" className="flex items-center justify-between gap-2.5 rounded-t-2xl px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white shadow-sm">
            <IconClock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Team Hours</p>
            <p className="truncate text-xs font-medium text-teal-700/70">logged this month</p>
          </div>
        </div>
        <span className="shrink-0 text-3xl font-bold tabular-nums text-teal-600">
          {state && "rows" in state ? totalMonth.toFixed(0) : "—"}
        </span>
      </Link>
      <div className="mx-2 mb-2 overflow-hidden rounded-xl bg-white/80 ring-1 ring-slate-100">
        {!state ? (
          <p className="px-4 py-2 text-sm text-slate-500">Loading from Autotask…</p>
        ) : "error" in state ? (
          <p className="px-4 py-2 text-sm text-red-600">{state.error}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-2 text-sm text-slate-500">No time entries logged yet.</p>
        ) : (
          // A single link wrapping every row, not one per row — clicking
          // any technician here opens the same all-technicians report for
          // yesterday (see /dashboard/resource-hours), not a view scoped to
          // just whoever happened to be clicked.
          <Link
            href={`/dashboard/resource-hours?date=${state.yesterdayDate}`}
            className="block divide-y divide-slate-100"
          >
            {rows.map((r) => (
              <div key={r.resourceId ?? r.resourceName} className="px-4 py-1.5 hover:bg-teal-50/60">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-slate-900">{r.resourceName}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    Today <span className="font-semibold text-slate-700">{r.today.toFixed(1)}h</span>
                    <span className="mx-1 text-slate-300">·</span>
                    Yesterday <span className="font-semibold text-slate-700">{r.yesterday.toFixed(1)}h</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${Math.max(4, (r.thisMonth / maxMonth) * 100)}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-teal-700">
                    {r.thisMonth.toFixed(1)}h this month
                  </span>
                </div>
              </div>
            ))}
          </Link>
        )}
      </div>
    </div>
  );
}
