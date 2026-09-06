"use client";

import { useState, useTransition } from "react";
import { ClientLookupErrors } from "@/components/client-lookup-errors";
import type { MfaGapRow, ClientLookupError } from "@/lib/m365-lookups";

type Result = { rows: MfaGapRow[]; errors: ClientLookupError[] } | { error: string };

export function MfaGapsRollup({ action }: { action: () => Promise<Result> }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    startLoad(async () => setResult(await action()));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">MFA gaps, all clients</h2>
          <p className="text-xs text-slate-500">
            Users not registered for multi-factor authentication — admin accounts sort first.
            Needs a Graph permission (AuditLog.Read.All) not yet consented on any client's app
            registration, so every client will show under the notice below until that's added.
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
                  <th className="px-5 py-2 text-left font-medium text-slate-500">User</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">UPN</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Admin?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((r, i) => (
                  <tr key={`${r.clientId}-${r.userPrincipalName}-${i}`} className={r.isAdmin ? "bg-red-50/60" : undefined}>
                    <td className="px-5 py-2 text-slate-900">{r.clientName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.userDisplayName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.userPrincipalName}</td>
                    <td className={`px-5 py-2 ${r.isAdmin ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {r.isAdmin ? "Admin" : "—"}
                    </td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                      No MFA gaps found (or no client could be checked yet).
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
