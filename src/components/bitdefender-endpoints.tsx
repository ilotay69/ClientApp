"use client";

import { useState, useTransition } from "react";
import type { BitdefenderEndpointRow } from "@/lib/bitdefender-lookups";

export function BitdefenderEndpoints({
  action,
}: {
  action: () => Promise<{ rows: BitdefenderEndpointRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<BitdefenderEndpointRow[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Bitdefender endpoints</h2>
          <p className="text-xs text-slate-500">
            Every protected endpoint across every company — OS, last successful scan, and whether
            the agent itself needs an update.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load endpoints"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Company</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Endpoint</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">OS</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">IP</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Agent</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Last scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.endpointId} className={r.productOutdated ? "bg-red-50/60" : undefined}>
                  <td className="px-5 py-2 text-slate-900">{r.companyName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.endpointName}</td>
                  <td className="px-5 py-2 text-slate-600">{r.os ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-600">{r.ip ?? "—"}</td>
                  <td className={`px-5 py-2 font-medium ${r.productOutdated ? "text-red-600" : "text-slate-600"}`}>
                    {r.productOutdated ? "Needs update" : "Up to date"}
                  </td>
                  <td className="px-5 py-2 text-slate-600">{r.lastScanDate ? r.lastScanDate.slice(0, 10) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-center text-slate-500">
                    No endpoints found.
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
