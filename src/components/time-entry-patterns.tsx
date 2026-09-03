"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import type { ClientPatternReport } from "@/lib/time-entry-insights";

type AnalyzeResult = { clients: ClientPatternReport[]; entryCount: number } | { error: string };

export function TimeEntryPatterns({
  analyzeAction,
}: {
  analyzeAction: () => Promise<AnalyzeResult>;
}) {
  const [clients, setClients] = useState<ClientPatternReport[] | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();

  const runAnalyze = () => {
    setAnalyzeError(null);
    startAnalyze(async () => {
      const result = await analyzeAction();
      if ("error" in result) {
        setAnalyzeError(result.error);
        setClients(null);
      } else {
        setClients(result.clients);
        setEntryCount(result.entryCount);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Ticket Pattern</h2>
          <p className="text-xs text-slate-500">
            Live read of the past 90 days from Autotask — nothing stored. Per-client recurring
            issues and inconsistent effort; clients with nothing notable are left out.
          </p>
        </div>
        <button
          type="button"
          onClick={runAnalyze}
          disabled={analyzing}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {analyzing ? "Analyzing…" : "Analyze patterns"}
        </button>
      </div>

      {analyzeError && <p className="px-5 py-3 text-sm text-red-600">{analyzeError}</p>}

      {clients && (
        <div className="divide-y divide-slate-100">
          {entryCount !== null && (
            <p className="px-5 py-2 text-xs text-slate-500">
              Read {entryCount} time entries from the past 90 days.
            </p>
          )}
          {clients.map((c, i) => (
            <div key={i} className="px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">{c.clientName}</p>
              <div className="mt-2 space-y-2">
                {c.findings.map((f, j) => (
                  <div key={j}>
                    <div className="flex items-center gap-2">
                      <Badge value={f.type} />
                      <p className="text-sm font-medium text-slate-900">{f.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{f.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {clients.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              Nothing genuinely notable found for any client over the past 90 days.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
