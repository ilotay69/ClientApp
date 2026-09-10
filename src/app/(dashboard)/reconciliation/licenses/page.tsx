import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { fetchReconciliationForClient, fetchClientLicenseSkus } from "@/lib/reconciliation-data";
import { saveServiceLicenseMapping, deleteServiceLicenseMapping } from "../actions";
import { ClientPicker } from "@/components/reconciliation-client-picker";
import { ReconciliationTable } from "@/components/reconciliation-table";

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
  const { data: clients } = await admin.from("clients").select("id, name").order("name");
  const clientList = (clients ?? []) as { id: string; name: string }[];

  const selectedClient = clientId ? (clientList.find((c) => c.id === clientId) ?? null) : null;

  const [result, clientSkus] = selectedClient
    ? await Promise.all([
        fetchReconciliationForClient(selectedClient.id),
        fetchClientLicenseSkus(selectedClient.id),
      ])
    : [null, []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">365 licence reconciliation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Compares a client&apos;s active contracted services against their Microsoft 365
          licence counts. A service with no matching licence yet needs mapping once — that
          mapping then applies to every client with the same service name.
        </p>
      </div>

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
          clientSkus={clientSkus}
          saveMappingAction={saveServiceLicenseMapping}
          deleteMappingAction={deleteServiceLicenseMapping}
        />
      )}
    </div>
  );
}
