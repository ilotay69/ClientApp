"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import type { TimeEntryFinding } from "@/lib/time-entry-insights";

type BackfillResult = { error: string | null; synced: number | null };
type AnalyzeResult = { findings: TimeEntryFinding[]; entryCount: number } | { error: string };

export function TimeEntryPatterns({
  backfillAction,
  analyzeAction,
}: {
  backfillAction: () => Promise<BackfillResult>;
  analyzeAction: () => Promise<AnalyzeResult>;
}) {
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [backfilling, startBackfill] = useTransition();

  const [findings, setFindings] = useState<TimeEntryFinding[] | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();

  const runBackfill = () => {
    setBackfillMsg(null);
    startBackfill(async () => {
      const result = await backfillAction();
      setBackfillMsg(
        result.error ?? `Backfilled ${result.synced ?? 0} time entries from the past 30 days.`
      );
    });
  };

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
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Pattern analysis</h2>
        <p className="text-xs text-slate-500">
          One-time backfill for the past month, then an AI read over the stored entries for
          recurring issues and inconsistent effort across clients.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <button
          type="button"
          onClick={runBackfill}
          disabled={backfilling}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {backfilling ? "Backfilling…" : "Backfill past month"}
        </button>
        <button
          type="button"
          onClick={runAnalyze}
          disabled={analyzing}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {analyzing ? "Analyzing…" : "Analyze patterns"}
        </button>
        {backfillMsg && <p className="text-sm text-slate-600">{backfillMsg}</p>}
      </div>

      {analyzeError && <p className="px-5 py-3 text-sm text-red-600">{analyzeError}</p>}

      {findings && (
        <div className="divide-y divide-slate-100">
          {entryCount !== null && (
            <p className="px-5 py-2 text-xs text-slate-500">
              Read {entryCount} stored time entries from the past 30 days.
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
              out in the stored history.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
