import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeleteButton } from "@/components/delete-button";
import { ServiceOfferingQuickAdd } from "@/components/service-offering-quick-add";
import { ServiceCoverageAnalysis } from "@/components/service-coverage-analysis";
import { hasPermission } from "@/lib/permissions";
import { createServiceOffering, deleteServiceOffering, analyzeServiceCoverageAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ServiceCatalogPage() {
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_services"))) {
    redirect("/dashboard");
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, name, description")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Service Catalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          The services your company offers clients. Attach any of these to a
          client from that client&apos;s page.
        </p>
      </div>

      <ServiceOfferingQuickAdd action={createServiceOffering} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Service</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Description</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(services ?? []).map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                <td className="px-5 py-3 text-slate-600">{s.description ?? "—"}</td>
                <td className="px-5 py-3">
                  <DeleteButton
                    action={deleteServiceOffering.bind(null, s.id)}
                    confirmText={`Remove "${s.name}" from the catalog? This also removes it from any client it's attached to.`}
                  />
                </td>
              </tr>
            ))}
            {(services ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-slate-500">
                  No services in the catalog yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ServiceCoverageAnalysis action={analyzeServiceCoverageAction} />
    </div>
  );
}
