"use client";

import { useState, useTransition } from "react";
import { ClientLookupErrors } from "@/components/client-lookup-errors";
import type { PrivilegedRoleRollupRow, ClientLookupError } from "@/lib/m365-lookups";

type Result = { rows: PrivilegedRoleRollupRow[]; errors: ClientLookupError[] } | { error: string };

export function PrivilegedRolesRollup({ action }: { action: () => Promise<Result> }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    startLoad(async () => setResult(await action()));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Privileged role assignments, all clients</h2>
          <p className="text-xs text-slate-500">
            Who holds Global Admin or another privileged role, across every client's tenant — "too
            many Global Admins" is a classic audit finding. Needs a Graph permission
            (RoleManagement.Read.Directory) not yet consented on any client's app registration.
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
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Role</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Member</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">UPN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((r, i) => (
                  <tr key={`${r.clientId}-${r.roleName}-${r.memberUpn ?? i}`}>
                    <td className="px-5 py-2 text-slate-900">{r.clientName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.roleName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.memberDisplayName}</td>
                    <td className="px-5 py-2 text-slate-700">{r.memberUpn ?? "—"}</td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                      No privileged role assignments found (or no client could be checked yet).
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
