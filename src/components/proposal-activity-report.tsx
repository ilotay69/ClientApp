"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDate, formatAge } from "@/lib/format";
import type { ProposalActivityReport, ProposalActivityRow } from "@/app/(dashboard)/proposals/actions";

type Result = ProposalActivityReport | { error: string };

/** "Last N days" is by sent_at, not created_at - a proposal drafted long
 * ago but sent recently is exactly what this report is meant to surface,
 * same convention as the Autotask lookups' own day-range pickers. */
export function ProposalActivityReportPanel({
  action,
}: {
  action: (days: number) => Promise<Result>;
}) {
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, startLoad] = useTransition();

  const run = () => {
    startLoad(async () => {
      setResult(await action(days));
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Proposal activity</h2>
        <p className="text-xs text-slate-500">
          Every proposal sent in the range you pick, grouped by where it currently stands.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          Last
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          days
        </label>
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

      {result && !("error" in result) && (
        <div className="divide-y divide-slate-100">
          <Group
            label="Sent"
            hint="Sent, not opened yet"
            rows={result.sent}
            emptyText="Nothing sent and unopened in that range."
          />
          <Group
            label="Waiting"
            hint="Opened, no decision yet"
            rows={result.waiting}
            emptyText="Nothing opened-and-waiting in that range."
          />
          <Group
            label="Accepted"
            hint="Accepted in that range"
            rows={result.accepted}
            emptyText="Nothing accepted in that range."
          />
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  hint,
  rows,
  emptyText,
}: {
  label: string;
  hint: string;
  rows: ProposalActivityRow[];
  emptyText: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 bg-slate-50 px-5 py-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
        <p className="ml-auto text-xs font-semibold text-slate-600">{rows.length}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/proposals/${r.id}`}
              className="flex items-center justify-between gap-3 px-5 py-2 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  #{r.proposalNumber} {r.title}
                </p>
                <p className="truncate text-xs text-slate-500">{r.companyName}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">
                <p>Sent {formatDate(r.sentAt)}</p>
                {r.acceptedAt ? (
                  <p>Accepted {formatDate(r.acceptedAt)}</p>
                ) : r.viewCount > 0 ? (
                  <p>
                    Opened {r.viewCount}× · last {formatAge(r.lastViewedAt)} ago
                  </p>
                ) : (
                  <p>Not opened</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
