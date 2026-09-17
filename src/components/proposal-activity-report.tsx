"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/proposal-totals";
import { Badge } from "@/components/badge";
import type { ProposalActivityRow } from "@/app/(dashboard)/proposals/actions";

type Result = { rows: ProposalActivityRow[] } | { error: string };

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "expired", label: "Expired" },
];

/** "Last N days" is by sent_at, not created_at - a proposal drafted long
 * ago but sent recently is exactly what this report is meant to surface,
 * same convention as the Autotask lookups' own day-range pickers.
 * Status/owner/client filters run client-side over the already-fetched
 * window, same as the client-mapping table's own search - the day range
 * already bounds the row count, so a second round trip per filter change
 * would just be slower for no benefit. */
export function ProposalActivityReportPanel({
  action,
}: {
  action: (days: number) => Promise<Result>;
}) {
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, startLoad] = useTransition();

  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [query, setQuery] = useState("");

  const run = () => {
    setResult(null);
    startLoad(async () => {
      setResult(await action(days));
    });
  };

  const rows = result && !("error" in result) ? result.rows : [];

  const owners = useMemo(() => {
    const names = new Set(rows.map((r) => r.ownerName).filter((n): n is string => Boolean(n)));
    return [...names].sort();
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (owner !== "all" && r.ownerName !== owner) return false;
      if (q && !r.companyName.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, status, owner, query]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Proposal activity</h2>
        <p className="text-xs text-slate-500">
          Every proposal sent in the range you pick, with its date, owner, client, value, and
          current status.
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
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client or title…"
              className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="all">All owners</option>
              {owners.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              {visible.length} of {rows.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Date</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Owner</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Title</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-500">$ Value</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 align-middle text-slate-700">
                      {formatDate(r.sentAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 align-middle text-slate-700">
                      {r.ownerName ?? "—"}
                    </td>
                    <td className="px-4 py-2 align-middle text-slate-700">{r.companyName}</td>
                    <td className="px-4 py-2 align-middle">
                      <Link href={`/proposals/${r.id}`} className="text-brand hover:underline">
                        #{r.proposalNumber} {r.title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right align-middle font-medium text-slate-900">
                      {formatMoney(r.value, r.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 align-middle">
                      <div className="flex items-center gap-1.5">
                        <Badge value={r.status} />
                        {r.status === "sent" && r.viewCount > 0 && (
                          <span className="text-xs text-slate-500">Opened {r.viewCount}×</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      {rows.length === 0 ? "Nothing sent in that range." : "No rows match that filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
