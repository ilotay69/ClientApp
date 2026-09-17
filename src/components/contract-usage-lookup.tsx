"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { ClientCombobox } from "@/components/client-combobox";
import type { ContractUsageRow } from "@/lib/contract-hours";

function hrs(n: number): string {
  return n.toFixed(1);
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

export function ContractUsageLookup({
  clients,
  action,
  sendAction,
}: {
  clients: { id: string; name: string; email?: string | null }[];
  action: (clientId: string) => Promise<{ rows: ContractUsageRow[] } | { error: string }>;
  sendAction?: (clientId: string, email: string) => Promise<{ error: string | null }>;
}) {
  const [clientId, setClientId] = useState("");
  const [rows, setRows] = useState<ContractUsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searching, startSearch] = useTransition();

  const [sendEmail, setSendEmail] = useState("");
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sending, startSend] = useTransition();
  // A one-off banner shown after Download PDF / a successful Send, once
  // the rest of the view has already been reset back to empty — kept
  // separate from `rows`/`clientId` so it survives that reset instead of
  // disappearing the instant the view clears.
  const [justFinished, setJustFinished] = useState<string | null>(null);

  const search = () => {
    setError(null);
    setJustFinished(null);
    startSearch(async () => {
      const result = await action(clientId);
      if ("error" in result) {
        setError(result.error);
        setRows(null);
      } else {
        setRows(result.rows);
        setExpandedId(null);
      }
    });
  };

  const selectClient = (id: string) => {
    setClientId(id);
    setSendResult(null);
    setJustFinished(null);
    setSendEmail(clients.find((c) => c.id === id)?.email ?? "");
  };

  // Clears the loaded report back to a blank picker — after a PDF
  // download or a successful send, there's nothing left to do with this
  // client's report on screen, so leaving it up just invites resending it
  // to the wrong recipient by mistake.
  const resetView = (message: string) => {
    setClientId("");
    setRows(null);
    setError(null);
    setExpandedId(null);
    setSendEmail("");
    setSendResult(null);
    setJustFinished(message);
  };

  const send = () => {
    if (!sendAction) return;
    setSendResult(null);
    startSend(async () => {
      const result = await sendAction(clientId, sendEmail);
      if (result.error) {
        setSendResult({ ok: false, message: result.error });
      } else {
        resetView("Report sent.");
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Contract Usage Report</h2>
          <p className="text-xs text-slate-500">
            One client's currently-active contract blocks — purchased vs. used hours, and every
            time entry recorded against each block, live from Autotask.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">Client</label>
            <ClientCombobox
              clients={clients}
              value={clientId}
              onChange={selectClient}
              className="mt-1 w-56"
            />
          </div>
          <button
            type="button"
            onClick={search}
            disabled={searching || !clientId}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {searching ? "Loading…" : "Load report"}
          </button>
          {rows && rows.length > 0 && (
            <a
              href={`/api/contract-usage-pdf/${clientId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => resetView("Downloaded.")}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Download PDF
            </a>
          )}
        </div>

        {sendAction && rows && rows.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Send to client email</label>
              <input
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="client@example.com"
                className="mt-1 w-full sm:w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={send}
              disabled={sending || !sendEmail.trim()}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send to Client"}
            </button>
            {sendResult && (
              <p className={`text-sm ${sendResult.ok ? "text-emerald-700" : "text-red-600"}`}>
                {sendResult.message}
              </p>
            )}
          </div>
        )}
      </div>

      {justFinished && !rows && (
        <p className="border-b border-slate-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-700">
          {justFinished}
        </p>
      )}
      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {rows && (
        <div className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              No currently-active contract blocks for this client.
            </p>
          )}
          {rows.map((r) => {
            const expanded = expandedId === r.contractId;
            return (
              <div key={r.contractId}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : r.contractId)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.contractName}</p>
                    <p className="text-xs text-slate-500">
                      {r.startDate.slice(0, 10)} – {r.endDate.slice(0, 10)} · {r.entries.length} time{" "}
                      {r.entries.length === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right text-xs text-slate-500">
                      <p>
                        <span className="font-medium text-slate-900">{hrs(r.used)}</span> / {hrs(r.purchased)} hrs used
                      </p>
                      <p>{hrs(r.remaining)} remaining</p>
                    </div>
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full ${barColor(r.percentUsed)}`}
                        style={{ width: `${Math.min(100, Math.max(0, r.percentUsed))}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs text-slate-500">{r.percentUsed.toFixed(0)}%</span>
                  </div>
                </button>
                {expanded && (
                  <div className="overflow-x-auto bg-slate-50 px-5 py-3">
                    {r.entries.length === 0 ? (
                      <p className="text-sm text-slate-500">No time entries recorded in this block's date range yet.</p>
                    ) : (
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead>
                          <tr>
                            <th className="py-1.5 pr-4 text-left font-medium text-slate-500">Date</th>
                            <th className="py-1.5 pr-4 text-left font-medium text-slate-500">Resource</th>
                            <th className="py-1.5 pr-4 text-right font-medium text-slate-500">Hours</th>
                            <th className="py-1.5 pr-4 text-left font-medium text-slate-500">Ticket/Task</th>
                            <th className="py-1.5 pr-4 text-left font-medium text-slate-500">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {r.entries.map((e) => (
                            <tr key={e.id} className={e.isNonBillable || !e.isApproved ? "opacity-60" : undefined}>
                              <td className="py-1.5 pr-4 text-slate-600">{formatDate(e.dateWorked)}</td>
                              <td className="py-1.5 pr-4 text-slate-700">{e.resourceName ?? "—"}</td>
                              <td className="py-1.5 pr-4 text-right text-slate-700">
                                {hrs(e.hoursToBill)}
                                {e.isNonBillable && <span className="ml-1 text-xs text-slate-400">(N/B)</span>}
                                {!e.isNonBillable && !e.isApproved && (
                                  <span className="ml-1 text-xs text-slate-400">(pending)</span>
                                )}
                              </td>
                              <td className="py-1.5 pr-4 text-slate-600">
                                {e.ticketId ? `Ticket #${e.ticketId}` : e.taskId ? `Task #${e.taskId}` : "—"}
                              </td>
                              <td className="py-1.5 pr-4 text-slate-600">{e.summaryNotes ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
