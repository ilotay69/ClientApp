"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import type {
  ReconciliationRow,
  UnmatchedLicenseRow,
} from "@/lib/reconciliation-data";
import type { SaveMappingState } from "@/app/(dashboard)/reconciliation/actions";

type ClientSku = { skuPartNumber: string; friendlyName: string };

export function ReconciliationTable({
  clientName,
  rows,
  unmatchedLicenses,
  clientSkus,
  saveMappingAction,
  deleteMappingAction,
}: {
  clientName: string;
  rows: ReconciliationRow[];
  unmatchedLicenses: UnmatchedLicenseRow[];
  clientSkus: ClientSku[];
  saveMappingAction: (prev: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
  deleteMappingAction: (serviceName: string) => Promise<void>;
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
              <th className="px-4 py-2 text-left font-medium text-slate-500">Mapping</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No active contracted services found for {clientName}.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <RowView
                key={row.serviceName}
                row={row}
                clientSkus={clientSkus}
                saveMappingAction={saveMappingAction}
                deleteMappingAction={deleteMappingAction}
              />
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

function RowView({
  row,
  clientSkus,
  saveMappingAction,
  deleteMappingAction,
}: {
  row: ReconciliationRow;
  clientSkus: ClientSku[];
  saveMappingAction: (prev: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
  deleteMappingAction: (serviceName: string) => Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(row.status === "unmapped");
  const [state, formAction, pending] = useActionState<SaveMappingState, FormData>(saveMappingAction, {
    error: null,
  });
  const [deletePending, startDeleteTransition] = useTransition();
  const submittedRef = useRef(false);

  // Collapses the picker back down once a save actually succeeds — checking
  // state.error alone isn't enough, since it's also null before any submit
  // has happened at all; the ref marks a real submit just occurred.
  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      submittedRef.current = false;
      setPickerOpen(false);
    }
  }, [pending, state.error]);

  return (
    <tr>
      <td className="px-4 py-2 text-slate-900">{row.serviceName}</td>
      <td className="px-4 py-2 text-slate-600">{row.contractedQuantity}</td>
      <td className="px-4 py-2 text-slate-600">{row.mappedSkuFriendlyName ?? "—"}</td>
      <td className="px-4 py-2 text-slate-600">{row.licensedUnits ?? "—"}</td>
      <td className="px-4 py-2">
        <Badge value={row.status} />
      </td>
      <td className="px-4 py-2">
        {pickerOpen ? (
          <form
            action={formAction}
            onSubmit={() => {
              submittedRef.current = true;
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="service_name" value={row.serviceName} />
            <select
              name="sku_part_number"
              required
              defaultValue={row.mappedSku ?? ""}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
            >
              <option value="" disabled>
                Choose a licence…
              </option>
              {clientSkus.map((s) => (
                <option key={s.skuPartNumber} value={s.skuPartNumber}>
                  {s.friendlyName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {row.status !== "unmapped" && (
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-xs text-slate-500 underline"
              >
                Cancel
              </button>
            )}
            {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
          </form>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="font-medium text-slate-500 underline"
            >
              Change
            </button>
            <button
              type="button"
              disabled={deletePending}
              onClick={() =>
                startDeleteTransition(async () => {
                  await deleteMappingAction(row.serviceName);
                })
              }
              className="font-medium text-red-600 underline disabled:opacity-60"
            >
              {deletePending ? "Removing…" : "Remove mapping"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
