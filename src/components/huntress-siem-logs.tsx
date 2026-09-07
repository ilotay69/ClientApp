"use client";

import { useState, useTransition } from "react";

export function HuntressSiemLogs({
  action,
}: {
  action: () => Promise<{ rows: Record<string, unknown>[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Huntress SIEM logs</h2>
          <p className="text-xs text-slate-500">
            Last 24 hours of log activity, account-wide — this is an add-on feature, not enabled on
            every Huntress plan. No confirmed way to filter by client yet.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load logs"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
          {rows.map((row, i) => (
            <div key={i} className="px-5 py-2 font-mono text-xs text-slate-700">
              {Object.entries(row).map(([key, value]) => (
                <div key={key}>
                  <span className="text-slate-400">{key}:</span> {String(value)}
                </div>
              ))}
            </div>
          ))}
          {rows.length === 0 && (
            <p className="px-5 py-4 text-center text-sm text-slate-500">No log rows returned.</p>
          )}
        </div>
      )}
    </div>
  );
}
