"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DEVICE_CLASS_LABELS, type DeviceClass, type ServiceDeviceMapping } from "@/lib/reconciliation-data";
import type { SaveMappingState } from "@/app/(dashboard)/reconciliation/actions";

const DEVICE_CLASS_OPTIONS = Object.entries(DEVICE_CLASS_LABELS) as [DeviceClass, string][];

/** Same shape as ServiceLicenseMappingsManager, for the NinjaOne side of
 * reconciliation — simpler than the licence one since a device class is a
 * fixed 3-option list, not a dynamic per-account set of synced SKUs. */
export function ServiceDeviceMappingsManager({
  mappings,
  unmappedServiceNames,
  saveMappingAction,
  deleteMappingAction,
}: {
  mappings: ServiceDeviceMapping[];
  unmappedServiceNames: string[];
  saveMappingAction: (prev: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
  deleteMappingAction: (serviceName: string) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Service ↔ device-count mappings</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Say once that a contracted service name (e.g. "Workstation Support") means a device
          class in NinjaOne, and every client with that same service name is checked against
          their actual managed device count automatically.
        </p>
      </div>

      <AddMappingForm unmappedServiceNames={unmappedServiceNames} saveMappingAction={saveMappingAction} />

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {mappings.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No mappings defined yet.</p>
        ) : (
          mappings.map((m) => (
            <MappingRow key={m.id} mapping={m} deleteMappingAction={deleteMappingAction} />
          ))
        )}
      </div>
    </div>
  );
}

function AddMappingForm({
  unmappedServiceNames,
  saveMappingAction,
}: {
  unmappedServiceNames: string[];
  saveMappingAction: (prev: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
}) {
  const [state, formAction, pending] = useActionState<SaveMappingState, FormData>(saveMappingAction, {
    error: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);

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
        <label className="block text-xs font-medium text-slate-700">Device class</label>
        <select
          name="device_class"
          required
          defaultValue=""
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="" disabled>
            Choose a device class…
          </option>
          {DEVICE_CLASS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
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
  deleteMappingAction,
}: {
  mapping: ServiceDeviceMapping;
  deleteMappingAction: (serviceName: string) => Promise<void>;
}) {
  const [deletePending, setDeletePending] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
      <div className="min-w-0">
        <span className="text-slate-900">{mapping.serviceName}</span>
        <span className="mx-2 text-slate-400">→</span>
        <span className="text-slate-600">{DEVICE_CLASS_LABELS[mapping.deviceClass]}</span>
      </div>
      <button
        type="button"
        disabled={deletePending}
        onClick={async () => {
          setDeletePending(true);
          await deleteMappingAction(mapping.serviceName);
        }}
        className="shrink-0 text-xs font-medium text-red-600 underline disabled:opacity-60"
      >
        {deletePending ? "Removing…" : "Remove"}
      </button>
    </div>
  );
}
