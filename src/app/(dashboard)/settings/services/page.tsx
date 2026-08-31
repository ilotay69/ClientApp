import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeleteButton } from "@/components/delete-button";
import { CatalogQuickAdd } from "@/components/catalog-quick-add";
import { hasPermission } from "@/lib/permissions";
import { createCatalogItem, deleteCatalogItem } from "./actions";

export const dynamic = "force-dynamic";

export default async function ServiceCatalogPage() {
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_service_catalog"))) {
    redirect("/dashboard");
  }

  const { data: catalog } = await supabase
    .from("service_catalog")
    .select("id, name, description, default_cadence_days")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Service catalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          The shared list of services and applications your team checks on a
          schedule. Add clients to one of these from that client&apos;s page,
          with their own cadence if it differs from the default.
        </p>
      </div>

      <CatalogQuickAdd action={createCatalogItem} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Service</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Description</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Default cadence</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(catalog ?? []).map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-5 py-3 text-slate-600">{c.description ?? "—"}</td>
                <td className="px-5 py-3 text-slate-600">Every {c.default_cadence_days} days</td>
                <td className="px-5 py-3">
                  <DeleteButton
                    action={deleteCatalogItem.bind(null, c.id)}
                    confirmText={`Remove "${c.name}" from the catalog? This also removes it from any client it's tracked on.`}
                  />
                </td>
              </tr>
            ))}
            {(catalog ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                  No services in the catalog yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
