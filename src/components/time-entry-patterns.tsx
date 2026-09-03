"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import type { TimeEntryFinding } from "@/lib/time-entry-insights";

type AnalyzeResult = { findings: TimeEntryFinding[]; entryCount: number } | { error: string };

export function TimeEntryPatterns({
  analyzeAction,
}: {
  analyzeAction: () => Promise<AnalyzeResult>;
}) {
  const [findings, setFindings] = useState<TimeEntryFinding[] | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();

  const runAnalyze = () => {
    setAnalyzeError(null);
    startAnalyze(async () => {
      const result = await analyzeAction();
      if ("error" in result) {
        setAnalyzeError(result.error);
        setFindings(null);
      } else {
        setFindings(result.findings);
        setEntryCount(result.entryCount);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Pattern analysis</h2>
          <p className="text-xs text-slate-500">
            Live read of the past 90 days from Autotask — nothing stored. Recurring issues and
            inconsistent effort across clients.
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

      {findings && (
        <div className="divide-y divide-slate-100">
          {entryCount !== null && (
            <p className="px-5 py-2 text-xs text-slate-500">
              Read {entryCount} time entries from the past 90 days.
            </p>
          )}
          {findings.map((f, i) => (
            <div key={i} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <Badge value={f.type} />
                <p className="text-sm font-medium text-slate-900">{f.title}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600">{f.detail}</p>
              {f.clients.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">{f.clients.join(", ")}</p>
              )}
            </div>
          ))}
          {findings.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              Nothing genuinely notable found — no recurring issues or inconsistent effort stood
              out over the past 90 days.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
