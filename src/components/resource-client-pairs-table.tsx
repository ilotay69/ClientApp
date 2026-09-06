"use client";

import { useState, useTransition } from "react";
import type { ResourceClientPairRow } from "@/lib/resource-client-pairs";

function hrs(n: number): string {
  return n.toFixed(1);
}

export function ResourceClientPairsTable({
  action,
}: {
  action: (days: number) => Promise<{ rows: ResourceClientPairRow[] } | { error: string }>;
}) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<ResourceClientPairRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const run = () => {
    setError(null);
    startLoad(async () => {
      const result = await action(days);
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
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Resource / client pairs</h2>
        <p className="text-xs text-slate-500">
          Who's working on which clients — hours and distinct days worked, so "a lot of hours in a
          few long days" reads differently from "spread thin across many days." Sorted by hours,
          highest first.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
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

      {error && <p className="px-5 py-4 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Resource</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Hours</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Days worked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.resourceId}-${r.clientId ?? "unattributed"}`}>
                  <td className="px-5 py-2 text-slate-900">{r.resourceName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.clientName}</td>
                  <td className="px-5 py-2 text-right font-medium text-slate-700">{hrs(r.hours)}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{r.daysWorked}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                    No time entries logged in that range.
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
