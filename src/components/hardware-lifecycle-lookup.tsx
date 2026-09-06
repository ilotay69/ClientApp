"use client";

import { useState, useTransition } from "react";
import type { AgingHardwareRow, OsEolRow } from "@/lib/device-lookups";

export function HardwareLifecycleLookup({
  agingAction,
  eolAction,
}: {
  agingAction: () => Promise<{ rows: AgingHardwareRow[] } | { error: string }>;
  eolAction: () => Promise<{ rows: OsEolRow[] } | { error: string }>;
}) {
  const [aging, setAging] = useState<AgingHardwareRow[] | null>(null);
  const [eol, setEol] = useState<OsEolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const [agingResult, eolResult] = await Promise.all([agingAction(), eolAction()]);
      if ("error" in agingResult) {
        setError(agingResult.error);
        setAging(null);
      } else {
        setAging(agingResult.rows);
      }
      if ("error" in eolResult) {
        setError((prev) => prev ?? eolResult.error);
        setEol(null);
      } else {
        setEol(eolResult.rows);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Aging hardware</h2>
            <p className="text-xs text-slate-500">
              Workstations 3+ years old and servers 5+ years old, across every client — oldest
              first.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {loading ? "Loading…" : aging || eol ? "Refresh" : "Load lifecycle data"}
          </button>
        </div>

        {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

        {aging && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Device</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Type</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aging.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 text-slate-900">{r.systemName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.clientName}</td>
                    <td className="px-5 py-2 text-slate-700 capitalize">{r.deviceType}</td>
                    <td className="px-5 py-2 text-right text-slate-700">{r.ageYears.toFixed(1)}y</td>
                  </tr>
                ))}
                {aging.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                      No hardware past its aging threshold.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {eol && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-2">
            <h2 className="text-sm font-semibold text-slate-900">OS end of life</h2>
            <p className="text-xs text-slate-500">
              Devices on an OS that's already end-of-life or nearing it, across every client —
              soonest first.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Device</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">OS</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">End of life</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eol.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2 text-slate-900">{r.systemName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.clientName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.eolLabel}</td>
                    <td
                      className={`px-5 py-2 ${r.daysToEol < 0 ? "font-medium text-red-600" : "text-amber-600"}`}
                    >
                      {r.eolDate}
                      {r.daysToEol < 0 ? " (past)" : ` (${r.daysToEol}d)`}
                    </td>
                  </tr>
                ))}
                {eol.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                      No devices on an end-of-life or soon-to-be OS.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
