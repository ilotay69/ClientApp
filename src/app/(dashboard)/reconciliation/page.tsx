import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { fetchReconciliationSummaryForAllClients } from "@/lib/reconciliation-data";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The monthly "who needs a look" entry point — every client, worst-first,
 * so a reconciliation pass starts here instead of clicking through clients
 * one at a time on the detail page (see ./licenses). Read-only: fixing
 * something (a mapping, a waiver, the underlying contract/licence/device
 * count itself) always happens on the per-client detail page this links
 * into.
 */
export default async function ReconciliationDashboardPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_reconciliation"))) {
    redirect("/dashboard");
  }

  const summaries = await fetchReconciliationSummaryForAllClients();
  const totalNeedsAttention = summaries.reduce((sum, s) => sum + s.needsAttention, 0);
  const clientsClean = summaries.filter((s) => s.needsAttention === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reconciliation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every client&apos;s contracted services vs. their actual Microsoft 365 licence and
            NinjaOne device counts, worst first.
          </p>
        </div>
        <Link
          href="/reconciliation/licenses"
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Manage mappings
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-2xl font-semibold text-slate-900">{totalNeedsAttention}</p>
          <p className="text-slate-500">Total items needing attention</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-2xl font-semibold text-slate-900">
            {clientsClean}/{summaries.length}
          </p>
          <p className="text-slate-500">Clients fully reconciled</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Needs attention</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Mismatch</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Unmapped</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Missing</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Waived</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Matched</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Last synced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summaries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No clients yet.
                </td>
              </tr>
            )}
            {summaries.map((s) => (
              <tr key={s.clientId} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/reconciliation/licenses?client_id=${s.clientId}`}
                    className="font-medium text-brand underline"
                  >
                    {s.clientName}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      s.needsAttention === 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {s.needsAttention}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{s.mismatch}</td>
                <td className="px-4 py-2 text-slate-600">{s.unmapped}</td>
                <td className="px-4 py-2 text-slate-600">{s.missing}</td>
                <td className="px-4 py-2 text-slate-600">{s.waived}</td>
                <td className="px-4 py-2 text-slate-600">{s.matched}</td>
                <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-400">
                  {s.lastSyncedAt ? formatDate(s.lastSyncedAt) : "Never synced"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
