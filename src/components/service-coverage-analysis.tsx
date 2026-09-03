"use client";

import { useState, useTransition } from "react";
import type { ServiceCoverageGap } from "@/lib/service-coverage-insights";

type AnalyzeResult = { gaps: ServiceCoverageGap[] } | { error: string };

export function ServiceCoverageAnalysis({
  action,
}: {
  action: () => Promise<AnalyzeResult>;
}) {
  const [gaps, setGaps] = useState<ServiceCoverageGap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();

  const runAnalyze = () => {
    setError(null);
    startAnalyze(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setGaps(null);
      } else {
        setGaps(result.gaps);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Coverage analysis</h2>
          <p className="text-xs text-slate-500">
            Reads every client&apos;s active Autotask contracted services — nothing to set up
            here — groups them into categories (MDR, backup, etc.), and flags clients missing one
            entirely. A different vendor for the same category still counts as covered.
          </p>
        </div>
        <button
          type="button"
          onClick={runAnalyze}
          disabled={analyzing}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {analyzing ? "Analyzing…" : "Analyze coverage"}
        </button>
      </div>

      {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}

      {gaps && (
        <div className="divide-y divide-slate-100">
          {gaps.map((g, i) => (
            <div key={i} className="px-5 py-3">
              <p className="text-sm font-medium text-slate-900">{g.category}</p>
              {g.matchedServices.length > 0 && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Covers: {g.matchedServices.join(", ")}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-700">
                Missing for: {g.missingClients.join(", ")}
              </p>
            </div>
          ))}
          {gaps.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              No real coverage gaps found — every client has at least one matching service in
              each category the catalog supports.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
