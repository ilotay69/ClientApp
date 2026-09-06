"use client";

import { useEffect, useState, useTransition } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import type { WeeklyPoint } from "@/lib/client-hours-trend";

type EntitiesResult = { id: string; name: string }[] | { error: string };
type TrendResult = { points: WeeklyPoint[] } | { error: string };

/** Shared "pick a client (or resource), see a weekly trend" shape —
 * covers hours-per-client, ticket-volume-per-client, and
 * hours-per-resource, which differ only in which entity is picked, the
 * chart type, and how a value is formatted. */
export function EntityTrendChart({
  title,
  subtitle,
  entityLabel,
  fetchEntitiesAction,
  fetchTrendAction,
  seriesName,
  color,
  chartType = "line",
  valueFormat = (v) => v.toFixed(1),
  defaultWeeks = 12,
}: {
  title: string;
  subtitle: string;
  entityLabel: string;
  fetchEntitiesAction: () => Promise<EntitiesResult>;
  fetchTrendAction: (entityId: string, weeks: number) => Promise<TrendResult>;
  seriesName: string;
  color: string;
  chartType?: "line" | "bar";
  valueFormat?: (v: number) => string;
  defaultWeeks?: number;
}) {
  const [entities, setEntities] = useState<{ id: string; name: string }[] | null>(null);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [weeks, setWeeks] = useState(defaultWeeks);
  const [result, setResult] = useState<TrendResult | null>(null);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    fetchEntitiesAction().then((res) => {
      if ("error" in res) setEntitiesError(res.error);
      else setEntities(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    if (!selectedId) return;
    startLoad(async () => {
      const res = await fetchTrendAction(selectedId, weeks);
      setResult(res);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
        {entitiesError && <p className="text-sm text-red-600">{entitiesError}</p>}
        {!entitiesError && (
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setResult(null);
            }}
            disabled={!entities}
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="">
              {entities ? `Select a ${entityLabel}…` : `Loading ${entityLabel}s…`}
            </option>
            {entities?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          Last
          <input
            type="number"
            min={1}
            max={104}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          weeks
        </label>
        <button
          type="button"
          onClick={run}
          disabled={loading || !selectedId}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {result && "error" in result && <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>}

      {result && !("error" in result) && (
        <TrendChart
          series={[{ name: seriesName, color, points: result.points }]}
          type={chartType}
          valueFormat={valueFormat}
        />
      )}
    </div>
  );
}
