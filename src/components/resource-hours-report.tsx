"use client";

import { useState, useTransition } from "react";
import type { ClientHoursRow } from "@/lib/resource-hours";

function hrs(n: number): string {
  return n.toFixed(1);
}

export function ResourceHoursReport({
  action,
}: {
  action: () => Promise<{ rows: ClientHoursRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<ClientHoursRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setRows(null);
      } else {
        setRows(result.rows);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Hours worked (Autotask)</h2>
          <p className="text-xs text-slate-500">
            Live from Autotask time entries — not stored, so it's only ever current as of when
            you load it.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load hours"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Today</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Yesterday</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">This week</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">This month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.clientId ?? "unattributed"}>
                  <td className="px-5 py-2 text-slate-900">{r.clientName}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{hrs(r.today)}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{hrs(r.yesterday)}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{hrs(r.thisWeek)}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{hrs(r.thisMonth)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-center text-slate-500">
                    No time entries logged this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
