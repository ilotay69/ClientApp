"use client";

import { useState, useTransition } from "react";

const DEFAULT_ESQL = "FROM logs | KEEP @timestamp, uuid, event.provider, host.hostname, message | LIMIT 100";
const DEFAULT_MINUTES = 15;

export function HuntressSiemLogs({
  action,
}: {
  action: (esql: string, minutesBack: number) => Promise<{ rows: Record<string, unknown>[] } | { error: string }>;
}) {
  const [esql, setEsql] = useState(DEFAULT_ESQL);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await action(esql, minutes);
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
        <h2 className="text-sm font-semibold text-slate-900">Huntress SIEM logs</h2>
        <p className="text-xs text-slate-500">
          Live ESQL query against Huntress&apos;s SIEM log store — this is an add-on feature, not
          enabled on every plan. Account-wide only; no confirmed way to filter by client yet. A
          wide time window or an unfiltered query can hit Huntress&apos;s own memory limit (413) —
          narrow the window or the query if that happens.
        </p>
      </div>

      <div className="space-y-2 border-b border-slate-200 px-5 py-2">
        <textarea
          value={esql}
          onChange={(e) => setEsql(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            Last
            <input
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            minutes
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? "Loading…" : "Run"}
          </button>
        </div>
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
