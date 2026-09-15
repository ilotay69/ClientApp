"use client";

import { useState, useTransition } from "react";
import type { ContractBlockHoursRow } from "@/lib/contract-hours";

function hrs(n: number): string {
  return n.toFixed(1);
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

export function ContractBlockHours({
  action,
}: {
  action: () => Promise<{ rows: ContractBlockHoursRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<ContractBlockHoursRow[] | null>(null);
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
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Prepaid / block hours remaining</h2>
          <p className="text-xs text-slate-500">
            Every active Autotask contract block — purchased vs. billable hours used so far.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load blocks"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Contract</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Purchased</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Used</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Remaining</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">% used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.contractId}>
                  <td className="px-5 py-2 text-slate-900">{r.clientName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.contractName}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{hrs(r.purchased)}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{hrs(r.used)}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{hrs(r.remaining)}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full ${barColor(r.percentUsed)}`}
                          style={{ width: `${Math.min(100, Math.max(0, r.percentUsed))}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{r.percentUsed.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-center text-slate-500">
                    No active contract blocks found.
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
