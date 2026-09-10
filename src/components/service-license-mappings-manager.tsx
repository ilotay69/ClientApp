"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { friendlyM365SkuName } from "@/lib/m365-sku-names";
import type { ServiceLicenseMapping } from "@/lib/reconciliation-data";
import type { SaveMappingState } from "@/app/(dashboard)/reconciliation/actions";

type Sku = { skuPartNumber: string; friendlyName: string };

/** The standalone "define the rule" screen — separate from the per-client
 * reconciliation table, which only ever shows a mapping prompt reactively
 * for whatever one client happens to have unmapped. Here staff can see and
 * manage every rule directly, and add a new one for a service that isn't
 * even the currently-selected client's. */
export function ServiceLicenseMappingsManager({
  mappings,
  unmappedServiceNames,
  allSkus,
  saveMappingAction,
  deleteMappingAction,
}: {
  mappings: ServiceLicenseMapping[];
  unmappedServiceNames: string[];
  allSkus: Sku[];
  saveMappingAction: (prev: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
  deleteMappingAction: (serviceName: string) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Service ↔ licence mappings</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Say once that a contracted service name means a given Microsoft 365 licence, and
          every client with that same service name is matched against it automatically —
          no need to select a client first.
        </p>
      </div>

      <AddMappingForm
        unmappedServiceNames={unmappedServiceNames}
        allSkus={allSkus}
        saveMappingAction={saveMappingAction}
      />

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {mappings.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No mappings defined yet.</p>
        ) : (
          mappings.map((m) => (
            <MappingRow
              key={m.id}
              mapping={m}
              allSkus={allSkus}
              saveMappingAction={saveMappingAction}
              deleteMappingAction={deleteMappingAction}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AddMappingForm({
  unmappedServiceNames,
  allSkus,
  saveMappingAction,
}: {
  unmappedServiceNames: string[];
  allSkus: Sku[];
  saveMappingAction: (prev: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
}) {
  const [state, formAction, pending] = useActionState<SaveMappingState, FormData>(saveMappingAction, {
    error: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

  // Clears the form back to blank once a save actually succeeds.
  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      submittedRef.current = false;
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submittedRef.current = true;
      }}
      className="flex flex-wrap items-end gap-2 px-4 py-3"
    >
      <div>
        <label className="block text-xs font-medium text-slate-700">Contracted service</label>
        <select
          name="service_name"
          required
          defaultValue=""
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="" disabled>
            Choose a service…
          </option>
          {unmappedServiceNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Equivalent 365 licence</label>
        <select
          name="sku_part_number"
          required
          defaultValue=""
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="" disabled>
            Choose a licence…
          </option>
          {allSkus.map((s) => (
            <option key={s.skuPartNumber} value={s.skuPartNumber}>
              {s.friendlyName}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : "Add mapping"}
      </button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function MappingRow({
  mapping,
  allSkus,
  saveMappingAction,
  deleteMappingAction,
}: {
  mapping: ServiceLicenseMapping;
  allSkus: Sku[];
  saveMappingAction: (prev: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
  deleteMappingAction: (serviceName: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [state, formAction, pending] = useActionState<SaveMappingState, FormData>(saveMappingAction, {
    error: null,
  });
  const submittedRef = useRef(false);

  // Collapses the editor back down once a save actually succeeds.
  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      submittedRef.current = false;
      setEditing(false);
    }
  }, [pending, state.error]);

  if (editing) {
    return (
      <form
        action={formAction}
        onSubmit={() => {
          submittedRef.current = true;
        }}
        className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm"
      >
        <input type="hidden" name="service_name" value={mapping.serviceName} />
        <span className="text-slate-900">{mapping.serviceName}</span>
        <span className="text-slate-400">→</span>
        <select
          name="sku_part_number"
          required
          defaultValue={mapping.skuPartNumber}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
        >
          {allSkus.map((s) => (
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
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-slate-500 underline"
        >
          Cancel
        </button>
        {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
      <div className="min-w-0">
        <span className="text-slate-900">{mapping.serviceName}</span>
        <span className="mx-2 text-slate-400">→</span>
        <span className="text-slate-600">{friendlyM365SkuName(mapping.skuPartNumber)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-medium text-slate-500 underline"
        >
          Change
        </button>
        <button
          type="button"
          disabled={deletePending}
          onClick={() =>
            startDeleteTransition(async () => {
              await deleteMappingAction(mapping.serviceName);
            })
          }
          className="font-medium text-red-600 underline disabled:opacity-60"
        >
          {deletePending ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}
