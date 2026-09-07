"use client";

import { useEffect, useState, useTransition } from "react";
import { ClientLookupErrors } from "@/components/client-lookup-errors";
import type { SecurityType, SecurityLookupResult } from "@/app/(dashboard)/settings/catalog/security-lookup-actions";

const TYPES: { value: SecurityType; label: string }[] = [
  { value: "edr", label: "EDR" },
  { value: "sat", label: "SAT" },
  { value: "itdr", label: "ITDR" },
];

/** Full agent inventory — not filtered to problems, so a healthy
 * environment still shows real, substantive data instead of an empty
 * "no issues" table. Defender/Firewall cells are highlighted only when
 * they look like a real concern. */
function EdrAgentTable({
  rows,
}: {
  rows: {
    agentId: number;
    hostname: string;
    organizationName: string;
    platform: string | null;
    os: string | null;
    lastCallbackAt: string | null;
    defenderStatus: string | null;
    firewallStatus: string | null;
  }[];
}) {
  const isDefenderConcern = (s: string | null) => s !== null && s.toLowerCase() !== "healthy";
  const isFirewallConcern = (s: string | null) => s !== null && s !== "Enabled";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Host</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Client / Org</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Platform</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">OS</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Last check-in</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Defender</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Firewall</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.agentId}>
              <td className="px-5 py-2 text-slate-900">{r.hostname}</td>
              <td className="px-5 py-2 text-slate-700">{r.organizationName}</td>
              <td className="px-5 py-2 text-slate-700">{r.platform ?? "—"}</td>
              <td className="px-5 py-2 text-slate-700">{r.os ?? "—"}</td>
              <td className="px-5 py-2 text-slate-700">
                {r.lastCallbackAt ? r.lastCallbackAt.slice(0, 10) : "Never"}
              </td>
              <td className={`px-5 py-2 ${isDefenderConcern(r.defenderStatus) ? "font-medium text-red-600" : "text-slate-700"}`}>
                {r.defenderStatus ?? "—"}
              </td>
              <td className={`px-5 py-2 ${isFirewallConcern(r.firewallStatus) ? "font-medium text-red-600" : "text-slate-700"}`}>
                {r.firewallStatus ?? "—"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-4 text-center text-slate-500">
                No agents found for this selection.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** ITDR (M365 identity risk) rows: one entity, which client it belongs
 * to, and a list of issue tags. */
function EntityIssuesTable({ rows }: { rows: { entity: string; scope: string; issues: string[] }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Entity</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Client / Org</th>
            <th className="px-5 py-2 text-left font-medium text-slate-500">Issues</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-5 py-2 text-slate-900">{r.entity}</td>
              <td className="px-5 py-2 text-slate-700">{r.scope}</td>
              <td className="px-5 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {r.issues.map((issue, j) => (
                    <span key={j} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      {issue}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-5 py-4 text-center text-slate-500">
                No issues found for this selection.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SecurityLookupByType({
  fetchClientsAction,
  lookupAction,
}: {
  fetchClientsAction: () => Promise<{ id: string; name: string }[] | { error: string }>;
  lookupAction: (type: SecurityType, clientId: string) => Promise<SecurityLookupResult>;
}) {
  const [clients, setClients] = useState<{ id: string; name: string }[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [type, setType] = useState<SecurityType>("edr");
  const [clientId, setClientId] = useState("");
  const [result, setResult] = useState<SecurityLookupResult | null>(null);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    fetchClientsAction().then((res) => {
      if ("error" in res) setClientsError(res.error);
      else setClients(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    setResult(null);
    startLoad(async () => {
      setResult(await lookupAction(type, clientId));
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Security coverage by type</h2>
        <p className="text-xs text-slate-500">
          Pick a category and a client (or All clients) — live from each vendor, nothing stored.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
        <div className="flex gap-1 rounded-md border border-slate-300 p-0.5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setType(t.value);
                setResult(null);
              }}
              className={`rounded px-3 py-1 text-sm font-medium ${
                type === t.value ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {clientsError && <p className="text-sm text-red-600">{clientsError}</p>}
        {!clientsError && (
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setResult(null);
            }}
            disabled={!clients}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="">{clients ? "All clients" : "Loading clients…"}</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {result && "error" in result && <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>}

      {result && !("error" in result) && result.type === "edr" && <EdrAgentTable rows={result.rows} />}

      {result && !("error" in result) && result.type === "itdr" && (
        <>
          <ClientLookupErrors errors={result.errors} />
          <EntityIssuesTable
            rows={result.rows.map((r) => ({
              entity: `${r.displayName} (${r.userPrincipalName})`,
              scope: r.clientName,
              issues: r.issues,
            }))}
          />
        </>
      )}
    </div>
  );
}
