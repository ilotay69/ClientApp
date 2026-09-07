"use client";

import { useState, useTransition } from "react";
import type { HuntressAgentAlertRow } from "@/lib/huntress-lookups";

export function HuntressAgentAlerts({
  action,
}: {
  action: () => Promise<{ rows: HuntressAgentAlertRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<HuntressAgentAlertRow[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Huntress agent alerts</h2>
          <p className="text-xs text-slate-500">
            Every protected endpoint with a real concern — hasn't checked in for 24+ hours, EDR
            isn't installed, Defender isn't healthy, or the firewall isn't enabled.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load agents"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Host</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Organization</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.agentId}>
                  <td className="px-5 py-2 text-slate-900">{r.hostname}</td>
                  <td className="px-5 py-2 text-slate-700">{r.organizationName}</td>
                  <td className="px-5 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {r.issues.map((issue, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                        >
                          {issue}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-4 text-center text-slate-500">
                    No agent health issues found.
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
