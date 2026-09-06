"use client";

import { useState, useTransition } from "react";
import { ClientLookupErrors } from "@/components/client-lookup-errors";
import type { MailboxUsageRollupRow, ClientLookupError } from "@/lib/m365-lookups";

type Result = { rows: MailboxUsageRollupRow[]; errors: ClientLookupError[] } | { error: string };

function gb(bytes: number): string {
  return (bytes / 1_000_000_000).toFixed(1) + " GB";
}

export function MailboxUsageRollup({ action }: { action: () => Promise<Result> }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    startLoad(async () => setResult(await action()));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Mailbox storage, all clients</h2>
          <p className="text-xs text-slate-500">
            Mailboxes closest to their storage quota, across every client — a lead-in for an
            Exchange Online Archiving or storage-tier conversation. Needs a Graph permission
            (Reports.Read.All) not yet consented on any client's app registration.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : result ? "Refresh" : "Load"}
        </button>
      </div>

      {result && "error" in result && <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>}

      {result && !("error" in result) && (
        <>
          <ClientLookupErrors errors={result.errors} />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Mailbox</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">Used / Quota</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">% used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((r, i) => (
                  <tr key={`${r.clientId}-${r.userPrincipalName}-${i}`}>
                    <td className="px-5 py-2 text-slate-900">{r.clientName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.displayName || r.userPrincipalName}</td>
                    <td className="px-5 py-2 text-right text-slate-700">
                      {gb(r.storageUsedBytes)} / {gb(r.quotaBytes)}
                    </td>
                    <td className={`px-5 py-2 text-right font-medium ${r.percentUsed >= 90 ? "text-red-600" : "text-slate-700"}`}>
                      {r.percentUsed.toFixed(0)}%
                    </td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                      No mailbox usage found (or no client could be checked yet).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
