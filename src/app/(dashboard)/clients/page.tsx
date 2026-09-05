import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { SearchBox } from "@/components/search-box";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const [{ data: clients }, canManageClients] = await Promise.all([
    q
      ? supabase.from("clients").select("id, name").ilike("name", `%${q}%`).order("name")
      : supabase.from("clients").select("id, name").order("name"),
    hasPermission(supabase, "manage_clients"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
        <div className="flex items-center gap-2">
          {canManageClients && (
            <Link
              href="/clients/new"
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Add Client
            </Link>
          )}
        </div>
      </div>

      <SearchBox action="/clients" placeholder="Search clients…" defaultValue={q} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(clients ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link
                    href={`/clients/${c.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
              </tr>
            ))}
            {(clients ?? []).length === 0 && (
              <tr>
                <td className="px-5 py-6 text-center text-slate-500">
                  {q ? (
                    <>
                      No clients match this search.{" "}
                      <Link href="/clients" className="underline">
                        Clear search
                      </Link>
                    </>
                  ) : (
                    <>
                      No clients yet.{" "}
                      <Link href="/clients/new" className="underline">
                        Add your first one.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
