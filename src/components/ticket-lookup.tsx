"use client";

import { useState, useTransition } from "react";
import { ClientCombobox } from "@/components/client-combobox";
import type { AutotaskTicketSearchRow } from "@/lib/autotask";

export function TicketLookup({
  clients,
  action,
}: {
  clients: { id: string; name: string }[];
  action: (
    clientId: string,
    subjectQuery: string,
    statusFilter: "open" | "completed"
  ) => Promise<{ rows: AutotaskTicketSearchRow[] } | { error: string }>;
}) {
  const [clientId, setClientId] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<"open" | "completed">("open");
  const [rows, setRows] = useState<AutotaskTicketSearchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  const search = () => {
    setError(null);
    startSearch(async () => {
      const result = await action(clientId, subject, status);
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
      <div className="space-y-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Ticket Lookup</h2>
          <p className="text-xs text-slate-500">
            Search one client's Autotask tickets by subject — live, including completed tickets
            (unlike the synced cache elsewhere, which only ever holds open ones).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">Client</label>
            <ClientCombobox clients={clients} value={clientId} onChange={setClientId} className="mt-1 w-56" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Subject contains</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search();
              }}
              placeholder="e.g. password reset"
              className="mt-1 w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-300 p-0.5">
            <button
              type="button"
              onClick={() => setStatus("open")}
              className={`rounded px-3 py-1 text-sm font-medium ${
                status === "open" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setStatus("completed")}
              className={`rounded px-3 py-1 text-sm font-medium ${
                status === "completed" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Completed
            </button>
          </div>
          <button
            type="button"
            onClick={search}
            disabled={searching || !clientId}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Ticket</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Priority</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Queue</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Assigned to</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">
                  {status === "completed" ? "Completed" : "Created"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2 text-slate-900">
                    {r.ticket_number ? `#${r.ticket_number} — ` : ""}
                    {r.title}
                  </td>
                  <td className="px-5 py-2 text-slate-700">{r.status ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">{r.priority ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">{r.queue_name ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">{r.assigned_resource_name ?? "Unassigned"}</td>
                  <td className="px-5 py-2 text-slate-600">
                    {(status === "completed" ? r.completed_at : r.opened_at)?.slice(0, 10) ?? "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-center text-slate-500">
                    No matching tickets.
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
