"use client";

import { useEffect, useState, useTransition } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import type { BlockOption } from "@/lib/contract-burndown";
import type { WeeklyPoint } from "@/lib/client-hours-trend";

type BlocksResult = { blocks: BlockOption[] } | { error: string };
type BurndownResult = { points: WeeklyPoint[]; purchased: number; clientName: string } | { error: string };

export function ContractBurndownChart({
  fetchBlocksAction,
  fetchBurndownAction,
}: {
  fetchBlocksAction: () => Promise<BlocksResult>;
  fetchBurndownAction: (blockId: number) => Promise<BurndownResult>;
}) {
  const [blocks, setBlocks] = useState<BlockOption[] | null>(null);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [result, setResult] = useState<BurndownResult | null>(null);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    fetchBlocksAction().then((res) => {
      if ("error" in res) setBlocksError(res.error);
      else setBlocks(res.blocks);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    if (!selectedBlockId) return;
    startLoad(async () => {
      const res = await fetchBurndownAction(Number(selectedBlockId));
      setResult(res);
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Block hours burn-down</h2>
        <p className="text-xs text-slate-500">
          Cumulative billable hours used against a contract block's purchased hours, week by week
          — see a client trending toward overage weeks before it happens, not the day it does.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
        {blocksError && <p className="text-sm text-red-600">{blocksError}</p>}
        {!blocksError && (
          <select
            value={selectedBlockId}
            onChange={(e) => {
              setSelectedBlockId(e.target.value);
              setResult(null);
            }}
            disabled={!blocks}
            className="w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="">
              {blocks ? (blocks.length === 0 ? "No active contract blocks" : "Select a contract block…") : "Loading blocks…"}
            </option>
            {blocks?.map((b) => (
              <option key={b.blockId} value={b.blockId}>
                {b.clientName} — {b.contractName} ({b.purchased}h, ends {b.endDate})
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={run}
          disabled={loading || !selectedBlockId}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {result && "error" in result && <p className="px-5 py-4 text-sm text-red-600">{result.error}</p>}

      {result && !("error" in result) && (
        <TrendChart
          series={[{ name: "Cumulative hours used", color: "#066ab5", points: result.points }]}
          referenceLine={result.purchased}
          referenceLineLabel={`Purchased (${result.purchased}h)`}
          valueFormat={(v) => v.toFixed(1)}
        />
      )}
    </div>
  );
}
