"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import type { TimeEntryFinding } from "@/lib/time-entry-insights";

type ClientsResult = { id: string; name: string }[] | { error: string };
type AnalyzeResult =
  | { clientName: string; findings: TimeEntryFinding[]; entryCount: number }
  | { error: string };

export function TimeEntryPatterns({
  fetchClientsAction,
  analyzeAction,
}: {
  fetchClientsAction: () => Promise<ClientsResult>;
  analyzeAction: (clientId: string) => Promise<AnalyzeResult>;
}) {
  const [clients, setClients] = useState<{ id: string; name: string }[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [analyzing, startAnalyze] = useTransition();

  useEffect(() => {
    fetchClientsAction().then((res) => {
      if ("error" in res) setClientsError(res.error);
      else setClients(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalyze = () => {
    if (!selectedClientId) return;
    setResult(null);
    startAnalyze(async () => {
      const res = await analyzeAction(selectedClientId);
      setResult(res);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Ticket Pattern</h2>
        <p className="text-xs text-slate-500">
          Pick a client to check the past 90 days of their logged time entries for a recurring
          issue (same problem keeps coming back) or inconsistent effort (similar work taking very
          different amounts of time). Live read from Autotask each time — nothing stored.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
        {clientsError && <p className="text-sm text-red-600">{clientsError}</p>}
        {!clientsError && (
          <select
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setResult(null);
            }}
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
        <button
          type="button"
          onClick={runAnalyze}
          disabled={analyzing || !selectedClientId}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {analyzing ? "Analyzing…" : "Analyze patterns"}
        </button>
      </div>

      {!analyzing && result && "error" in result && (
        <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>
      )}

      {!analyzing && result && !("error" in result) && (
        <div className="divide-y divide-slate-100">
          <p className="px-5 py-2 text-xs text-slate-500">
            Read {result.entryCount} time entries for {result.clientName} from the past 90 days.
          </p>
          {result.findings.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              Nothing genuinely notable found for {result.clientName} over the past 90 days.
            </p>
          ) : (
            <div className="space-y-2 px-5 py-2">
              {result.findings.map((f, j) => (
                <div key={j}>
                  <div className="flex items-center gap-2">
                    <Badge value={f.type} />
                    <p className="text-sm font-medium text-slate-900">{f.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{f.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
