"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type {
  ReconciliationRow,
  UnmatchedLicenseRow,
  UnmatchedDeviceRow,
} from "@/lib/reconciliation-data";
import type { SaveWaiverState } from "@/app/(dashboard)/reconciliation/actions";

const SOURCE_LABELS: Record<string, string> = { m365: "M365", ninjaone: "NinjaOne" };

function WaiveControl({
  clientId,
  source,
  serviceName,
  waiver,
  saveWaiverAction,
  deleteWaiverAction,
}: {
  clientId: string;
  source: "m365" | "ninjaone";
  serviceName: string;
  waiver: ReconciliationRow["waiver"];
  saveWaiverAction: (prev: SaveWaiverState, formData: FormData) => Promise<SaveWaiverState>;
  deleteWaiverAction: (clientId: string, source: string, serviceName: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [state, formAction, pending] = useActionState<SaveWaiverState, FormData>(saveWaiverAction, {
    error: null,
  });

  if (waiver) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600"
          title={`${waiver.note} — ${waiver.waivedByName ?? "staff"}, ${formatDate(waiver.waivedAt)}`}
        >
          Waived
        </span>
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            await deleteWaiverAction(clientId, source, serviceName);
          }}
          className="text-slate-400 underline disabled:opacity-60"
        >
          {removing ? "…" : "Un-waive"}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-slate-500 underline">
        Waive
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="service_name" value={serviceName} />
      <input
        name="note"
        required
        placeholder="Why is this OK as-is?"
        className="w-48 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs focus:border-slate-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="text-xs font-medium text-brand underline disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 underline">
          Cancel
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

/** The mapping itself is managed elsewhere (the two mapping-manager panels
 * above this table) — this is read-only for that. Waiving/un-waiving a
 * mismatch, though, happens right here per-row, since it's specific to
 * this one client, not a global rule. */
export function ReconciliationTable({
  clientId,
  clientName,
  rows,
  unmatchedLicenses,
  unmatchedDevices,
  saveWaiverAction,
  deleteWaiverAction,
}: {
  clientId: string;
  clientName: string;
  rows: ReconciliationRow[];
  unmatchedLicenses: UnmatchedLicenseRow[];
  unmatchedDevices: UnmatchedDeviceRow[];
  saveWaiverAction: (prev: SaveWaiverState, formData: FormData) => Promise<SaveWaiverState>;
  deleteWaiverAction: (clientId: string, source: string, serviceName: string) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Contracted service</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Source</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Contracted qty</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Mapped to</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Actual units</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No active contracted services found for {clientName}.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.serviceName}>
                <td className="px-4 py-2 text-slate-900">{row.serviceName}</td>
                <td className="px-4 py-2 text-slate-600">{row.source ? SOURCE_LABELS[row.source] : "—"}</td>
                <td className="px-4 py-2 text-slate-600">{row.contractedQuantity}</td>
                <td className="px-4 py-2 text-slate-600">{row.mappedLabel ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{row.actualUnits ?? "—"}</td>
                <td className="px-4 py-2">
                  <Badge value={row.status} />
                </td>
                <td className="px-4 py-2">
                  {row.source && (row.status === "mismatch" || row.status === "license_missing") && (
                    <WaiveControl
                      clientId={clientId}
                      source={row.source}
                      serviceName={row.serviceName}
                      waiver={row.waiver}
                      saveWaiverAction={saveWaiverAction}
                      deleteWaiverAction={deleteWaiverAction}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(unmatchedLicenses.length > 0 || unmatchedDevices.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Provisioned but not matched to any contracted service</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {clientName} has these licences or devices, but no active contracted service maps to
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
            {unmatchedDevices.map((d) => (
              <div key={d.deviceClass} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-slate-900">{d.label} (NinjaOne)</span>
                <span className="text-slate-600">{d.count} managed</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
