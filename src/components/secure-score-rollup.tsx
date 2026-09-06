"use client";

import { useState, useTransition } from "react";
import { ClientLookupErrors } from "@/components/client-lookup-errors";
import type { SecureScoreRollupRow, ClientLookupError } from "@/lib/m365-lookups";

type Result = { rows: SecureScoreRollupRow[]; errors: ClientLookupError[] } | { error: string };

function barColor(pct: number): string {
  if (pct < 40) return "bg-red-500";
  if (pct < 65) return "bg-amber-500";
  return "bg-emerald-500";
}

export function SecureScoreRollup({ action }: { action: () => Promise<Result> }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    startLoad(async () => setResult(await action()));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Secure Score, all clients</h2>
          <p className="text-xs text-slate-500">
            Every client's current Microsoft Secure Score — lowest (needs the most attention) first.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : result ? "Refresh" : "Load"}
        </button>
      </div>

      {result && "error" in result && <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>}

      {result && !("error" in result) && (
        <>
          <ClientLookupErrors errors={result.errors} />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">Score</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">% of max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((r) => (
                  <tr key={r.clientId}>
                    <td className="px-5 py-2 text-slate-900">{r.clientName}</td>
                    <td className="px-5 py-2 text-right text-slate-700">
                      {r.currentScore.toFixed(0)} / {r.maxScore.toFixed(0)}
                    </td>
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full ${barColor(r.percent)}`}
                            style={{ width: `${Math.min(100, Math.max(0, r.percent))}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{r.percent.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-4 text-center text-slate-500">
                      No clients with Microsoft 365 connected yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
