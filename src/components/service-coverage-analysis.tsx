"use client";

import { useEffect, useState, useTransition } from "react";

export type ClientServiceGap = { serviceName: string; otherClientCount: number };

type ClientsResult = { id: string; name: string }[] | { error: string };
type GapsResult = { clientName: string; gaps: ClientServiceGap[] } | { error: string };

export function ServiceCoverageAnalysis({
  fetchClientsAction,
  fetchGapsAction,
}: {
  fetchClientsAction: () => Promise<ClientsResult>;
  fetchGapsAction: (clientId: string) => Promise<GapsResult>;
}) {
  const [clients, setClients] = useState<{ id: string; name: string }[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [result, setResult] = useState<GapsResult | null>(null);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    fetchClientsAction().then((res) => {
      if ("error" in res) setClientsError(res.error);
      else setClients(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runLookup = (clientId: string) => {
    setSelectedClientId(clientId);
    setResult(null);
    if (!clientId) return;
    startLoading(async () => {
      const res = await fetchGapsAction(clientId);
      setResult(res);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Sales opportunities</h2>
        <p className="text-xs text-slate-500">
          Pick a client to see which active Autotask contracted services other clients have that
          this one doesn&apos;t — sorted by how many other clients have it, so the strongest upsell
          signal sorts first. Excludes Microsoft 365/Office 365 licensing (seat count and plan tier
          vary per client, not a real gap). Exact service names, not vendor-equivalent grouping — use
          judgment on any result that&apos;s really just a different brand of something this client
          already has.
        </p>
      </div>

      <div className="border-b border-slate-200 px-5 py-2">
        {clientsError && <p className="text-sm text-red-600">{clientsError}</p>}
        {!clientsError && (
          <select
            value={selectedClientId}
            onChange={(e) => runLookup(e.target.value)}
            disabled={!clients}
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="">{clients ? "Select a client…" : "Loading clients…"}</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && <p className="px-5 py-4 text-sm text-slate-500">Checking…</p>}

      {!loading && result && "error" in result && (
        <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>
      )}

      {!loading && result && !("error" in result) && (
        <div className="divide-y divide-slate-100">
          {result.gaps.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              {result.clientName} has everything at least one other client has — no gap found.
            </p>
          ) : (
            result.gaps.map((g) => (
              <div key={g.serviceName} className="flex items-center justify-between px-5 py-2">
                <p className="text-sm font-medium text-slate-900">{g.serviceName}</p>
                <p className="text-xs text-slate-500">
                  {g.otherClientCount} other client{g.otherClientCount === 1 ? "" : "s"} {g.otherClientCount === 1 ? "has" : "have"} this
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
