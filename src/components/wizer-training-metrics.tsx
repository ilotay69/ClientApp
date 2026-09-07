"use client";

import { useState, useTransition } from "react";
import type { WizerCompanyMetricsRow } from "@/lib/wizer-lookups";

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(0)}%`;
}

export function WizerTrainingMetrics({
  action,
}: {
  action: () => Promise<{ rows: WizerCompanyMetricsRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<WizerCompanyMetricsRow[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Wizer training &amp; phishing metrics</h2>
          <p className="text-xs text-slate-500">
            Training completion and phishing simulation click rate per company — highest click rate
            (the real risk signal) first.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load metrics"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Company</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Users</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Training completed</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Phishing clicked</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Phishing reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.companyId}
                  className={r.phishingClickedPct != null && r.phishingClickedPct >= 25 ? "bg-red-50/60" : undefined}
                >
                  <td className="px-5 py-2 text-slate-900">{r.companyName}</td>
                  <td className="px-5 py-2 text-slate-600">
                    {r.usersRegistered}/{r.usersTotal} registered
                  </td>
                  <td className="px-5 py-2 text-slate-700">
                    {pct(r.trainingCompletedPct)}{" "}
                    <span className="text-slate-400">
                      ({r.trainingCompleted}/{r.trainingAssigned})
                    </span>
                  </td>
                  <td
                    className={`px-5 py-2 font-medium ${
                      r.phishingClickedPct != null && r.phishingClickedPct >= 25
                        ? "text-red-600"
                        : r.phishingClickedPct != null && r.phishingClickedPct > 0
                          ? "text-amber-600"
                          : "text-slate-600"
                    }`}
                  >
                    {pct(r.phishingClickedPct)}{" "}
                    <span className="font-normal text-slate-400">
                      ({r.phishingClicked}/{r.phishingParticipated})
                    </span>
                  </td>
                  <td className="px-5 py-2 text-slate-600">{r.phishingReported}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-center text-slate-500">
                    No companies found.
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
