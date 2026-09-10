import { Badge } from "@/components/badge";
import type { ReconciliationRow, UnmatchedLicenseRow } from "@/lib/reconciliation-data";

/** Read-only — mapping is managed in exactly one place, the
 * ServiceLicenseMappingsManager panel above this table. An "Unmapped"
 * status here is just a status; fixing it happens up there. */
export function ReconciliationTable({
  clientName,
  rows,
  unmatchedLicenses,
}: {
  clientName: string;
  rows: ReconciliationRow[];
  unmatchedLicenses: UnmatchedLicenseRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Contracted service</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Contracted qty</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Mapped licence</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Licensed units</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  No active contracted services found for {clientName}.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.serviceName}>
                <td className="px-4 py-2 text-slate-900">{row.serviceName}</td>
                <td className="px-4 py-2 text-slate-600">{row.contractedQuantity}</td>
                <td className="px-4 py-2 text-slate-600">{row.mappedSkuFriendlyName ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{row.licensedUnits ?? "—"}</td>
                <td className="px-4 py-2">
                  <Badge value={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unmatchedLicenses.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Licensed but not matched to any contracted service
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {clientName} has these licences assigned, but no active contracted service maps to
              them — either an oversight in the contract, or the service uses a name not yet
              mapped above.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {unmatchedLicenses.map((l) => (
              <div key={l.skuPartNumber} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-slate-900">{l.friendlyName}</span>
                <span className="text-slate-600">{l.enabledUnits} enabled</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
