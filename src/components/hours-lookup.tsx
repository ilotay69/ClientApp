"use client";

import { useState, useTransition } from "react";
import type { HoursByGroupRow } from "@/lib/resource-hours";

type Result = { rows: HoursByGroupRow[] } | { error: string };

function hrs(n: number): string {
  return n.toFixed(1);
}

export function HoursLookup({
  action,
  title = "Hours by client or resource",
  subtitle = "Total hours logged in Autotask over a range you pick — live, nothing stored.",
}: {
  action: (groupBy: "client" | "resource", days: number) => Promise<Result>;
  title?: string;
  subtitle?: string;
}) {
  const [groupBy, setGroupBy] = useState<"client" | "resource">("client");
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, startLoad] = useTransition();

  const run = () => {
    startLoad(async () => {
      const res = await action(groupBy, days);
      setResult(res);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as "client" | "resource")}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="client">By client</option>
          <option value="resource">By resource</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          Last
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          days
        </label>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {result && "error" in result && (
        <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>
      )}

      {result && !("error" in result) && (
        <div className="divide-y divide-slate-100">
          {result.rows.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              No time entries logged in that range.
            </p>
          ) : (
            result.rows.map((r) => (
              <div
                key={r.groupId ?? "unattributed"}
                className="flex items-center justify-between px-5 py-2"
              >
                <p className="text-sm text-slate-900">{r.groupName}</p>
                <p className="text-sm font-medium text-slate-700">{hrs(r.hours)}h</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
