"use client";

import { useState, useTransition } from "react";
import type { MissingPatchRow } from "@/lib/device-security-lookups";

export function MissingPatchesLookup({
  action,
}: {
  action: () => Promise<{ rows: MissingPatchRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<MissingPatchRow[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Missing OS patches</h2>
          <p className="text-xs text-slate-500">
            Pending, failed, or rejected OS patches across every client — live from NinjaOne,
            nothing stored. Can be slow: one call per client.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load patch status"}
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
                <th className="px-5 py-2 text-left font-medium text-slate-500">Patch</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">KB</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Severity</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={`${r.deviceId}-${r.kbNumber ?? r.patchName ?? i}`}>
                  <td className="px-5 py-2 text-slate-900">{r.deviceName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.clientName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.patchName ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">{r.kbNumber ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">{r.severity ?? "—"}</td>
                  <td className="px-5 py-2 font-medium text-amber-600">{r.status ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-center text-slate-500">
                    No missing patches — everything up to date.
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
