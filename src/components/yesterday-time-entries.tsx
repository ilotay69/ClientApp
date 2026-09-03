"use client";

import { useState, useTransition } from "react";
import type { TimeEntryForAnalysis } from "@/lib/time-entry-insights";

export function YesterdayTimeEntries({
  action,
}: {
  action: () => Promise<{ entries: TimeEntryForAnalysis[] } | { error: string }>;
}) {
  const [entries, setEntries] = useState<TimeEntryForAnalysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setEntries(null);
      } else {
        setEntries(result.entries);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Yesterday&apos;s time entries</h2>
          <p className="text-xs text-slate-500">
            Live from Autotask — every individual entry logged on the last business day, nothing
            stored.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : entries ? "Refresh" : "Load entries"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {entries && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Resource</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Ticket</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Hours</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">What was done</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="px-5 py-2 text-slate-900">{e.resourceName}</td>
                  <td className="px-5 py-2 text-slate-700">{e.clientName ?? "Unattributed"}</td>
                  <td className="px-5 py-2 text-slate-700">{e.ticketId ? `#${e.ticketId}` : "—"}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{e.hoursWorked.toFixed(1)}</td>
                  <td className="px-5 py-2 text-slate-600">{e.summaryNotes ?? "—"}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-center text-slate-500">
                    No time entries logged on the last business day.
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
