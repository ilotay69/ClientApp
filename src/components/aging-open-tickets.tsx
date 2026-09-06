"use client";

import { useState, useTransition } from "react";
import type { AgingTicketRow } from "@/lib/ticket-aging";

export function AgingOpenTickets({
  action,
}: {
  action: () => Promise<{ rows: AgingTicketRow[] } | { error: string }>;
}) {
  const [rows, setRows] = useState<AgingTicketRow[] | null>(null);
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
          <h2 className="text-sm font-semibold text-slate-900">Overdue / aging open tickets</h2>
          <p className="text-xs text-slate-500">
            Every open ticket account-wide, live from Autotask — overdue first, then oldest.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : rows ? "Refresh" : "Load tickets"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Ticket</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Queue</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Assigned to</th>
                <th className="px-5 py-2 text-right font-medium text-slate-500">Days open</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.isOverdue ? "bg-red-50/60" : undefined}>
                  <td className="px-5 py-2 text-slate-900">{r.title}</td>
                  <td className="px-5 py-2 text-slate-700">{r.clientName}</td>
                  <td className="px-5 py-2 text-slate-700">{r.queueName ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">{r.assignedResourceName ?? "Unassigned"}</td>
                  <td className="px-5 py-2 text-right text-slate-700">{r.daysOpen}</td>
                  <td className={`px-5 py-2 ${r.isOverdue ? "font-medium text-red-600" : "text-slate-600"}`}>
                    {r.dueDate ? r.dueDate.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-center text-slate-500">
                    No open tickets.
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
