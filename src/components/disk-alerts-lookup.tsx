"use client";

import { useState, useTransition } from "react";
import type { DiskAlertRow } from "@/lib/device-lookups";

function gb(bytes: number): string {
  return (bytes / 1_000_000_000).toFixed(0) + " GB";
}

export function DiskAlertsLookup({
  action,
}: {
  action: () => Promise<{ rows: DiskAlertRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<DiskAlertRow[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Disk space alerts</h2>
          <p className="text-xs text-slate-500">
            Devices over 90% disk usage across every client, from the last NinjaOne sync — fullest
            first.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load devices"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Device</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Used / Total</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">% used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2 text-slate-900">{r.systemName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.clientName}</td>
                  <td className="px-5 py-2 text-right text-slate-700">
                    {gb(r.totalBytes - r.freeBytes)} / {gb(r.totalBytes)}
                  </td>
                  <td className="px-5 py-2 text-right font-medium text-red-600">
                    {r.percentUsed.toFixed(0)}%
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                    No devices over 90% disk usage.
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
