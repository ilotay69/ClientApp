"use client";

import { useState, useTransition } from "react";
import type { HuntressOpenIncidentRow } from "@/lib/huntress-lookups";

export function HuntressOpenIncidents({
  action,
}: {
  action: () => Promise<{ rows: HuntressOpenIncidentRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<HuntressOpenIncidentRow[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Huntress open incidents</h2>
          <p className="text-xs text-slate-500">
            Every incident report still awaiting action or being auto-remediated, across every
            organization — critical severity first.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load incidents"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Organization</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Subject</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Severity</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.incidentId} className={r.severity === "critical" ? "bg-red-50/60" : undefined}>
                  <td className="px-5 py-2 text-slate-900">{r.organizationName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.subject}</td>
                  <td
                    className={`px-5 py-2 font-medium ${
                      r.severity === "critical"
                        ? "text-red-600"
                        : r.severity === "high"
                          ? "text-amber-600"
                          : "text-slate-600"
                    }`}
                  >
                    {r.severity ?? "—"}
                  </td>
                  <td className="px-5 py-2 text-slate-700">{r.status}</td>
                  <td className="px-5 py-2 text-slate-600">{r.sentAt ? r.sentAt.slice(0, 10) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-center text-slate-500">
                    No open incidents.
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
