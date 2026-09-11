import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import {
  fetchReconciliationForClient,
  fetchServiceLicenseMappings,
  fetchAllKnownSkus,
  fetchAllContractedServiceNames,
} from "@/lib/reconciliation-data";
import { saveServiceLicenseMapping, deleteServiceLicenseMapping } from "../actions";
import { ClientPicker } from "@/components/reconciliation-client-picker";
import { ReconciliationTable } from "@/components/reconciliation-table";
import { ServiceLicenseMappingsManager } from "@/components/service-license-mappings-manager";

export const dynamic = "force-dynamic";

export default async function LicenseReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_reconciliation"))) {
    redirect("/dashboard");
  }

  const { client_id: clientId } = await searchParams;

  const admin = createAdminClient();
  const [{ data: clients }, mappings, allSkus, allServiceNames] = await Promise.all([
    admin.from("clients").select("id, name").order("name"),
    fetchServiceLicenseMappings(admin),
    fetchAllKnownSkus(),
    fetchAllContractedServiceNames(),
  ]);
  const clientList = (clients ?? []) as { id: string; name: string }[];

  const mappedServiceNames = new Set(mappings.map((m) => m.serviceName.trim().toLowerCase()));
  const unmappedServiceNames = allServiceNames.filter(
    (name) => !mappedServiceNames.has(name.trim().toLowerCase())
  );

  // Same idea for the "add a mapping" licence dropdown — a SKU already used
  // by some other mapping is dropped from the create-new picklist, so what's
  // left is exactly what's still pending a match. The edit-row dropdown
  // (changing an existing mapping) still gets every SKU, unfiltered.
  const mappedSkus = new Set(mappings.map((m) => m.skuPartNumber));
  const unmappedSkus = allSkus.filter((s) => !mappedSkus.has(s.skuPartNumber));

  const selectedClient = clientId ? (clientList.find((c) => c.id === clientId) ?? null) : null;

  const result = selectedClient ? await fetchReconciliationForClient(selectedClient.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">365 licence reconciliation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Compares a client&apos;s active contracted services against their Microsoft 365
          licence counts.
        </p>
      </div>

      <ServiceLicenseMappingsManager
        mappings={mappings}
        unmappedServiceNames={unmappedServiceNames}
        allSkus={allSkus}
        unmappedSkus={unmappedSkus}
        saveMappingAction={saveServiceLicenseMapping}
        deleteMappingAction={deleteServiceLicenseMapping}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">Client</label>
        <div className="mt-1 max-w-sm">
          <ClientPicker clients={clientList} selectedId={selectedClient?.id ?? null} />
        </div>
      </div>

      {!selectedClient || !result ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Choose a client to reconcile.</p>
        </div>
      ) : (
        <ReconciliationTable
          clientName={selectedClient.name}
          rows={result.rows}
          unmatchedLicenses={result.unmatchedLicenses}
        />
      )}
    </div>
  );
}
