"use client";

import { useState, useTransition } from "react";
import type { HuntressAgent } from "@/lib/huntress";

export function ClientHuntressAgents({
  organizationId,
  action,
}: {
  organizationId: number | null;
  action: () => Promise<{ agents: HuntressAgent[] } | { error: string }>;
}) {
  const [agents, setAgents] = useState<HuntressAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setAgents(null);
      } else {
        setAgents(result.agents);
      }
    });
  };

  if (organizationId === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Huntress</h2>
        <p className="mt-1 text-sm text-slate-500">
          Not linked to a Huntress organization yet — use &quot;Link to Huntress&quot; above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Huntress</h2>
          <p className="text-xs text-slate-500">Live from Huntress — nothing stored.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : agents ? "Refresh" : "Load agents"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {agents && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Host</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Platform</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Last check-in</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Defender</th>
                <th className="px-5 py-2 text-left font-medium text-slate-500">Firewall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agents.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-2 text-slate-900">{a.hostname}</td>
                  <td className="px-5 py-2 text-slate-700">{a.platform ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">
                    {a.lastCallbackAt ? a.lastCallbackAt.slice(0, 10) : "Never"}
                  </td>
                  <td className="px-5 py-2 text-slate-700">{a.defenderStatus ?? "—"}</td>
                  <td className="px-5 py-2 text-slate-700">{a.firewallStatus ?? "—"}</td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-center text-slate-500">
                    No agents found for this organization.
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
