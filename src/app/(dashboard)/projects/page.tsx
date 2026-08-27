import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, target_end_date, clients(name)")
    .order("target_end_date", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New project
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Name</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Client</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Target end</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(projects ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {(p.clients as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-5 py-3 text-slate-600">{formatDate(p.target_end_date)}</td>
                <td className="px-5 py-3">
                  <Badge value={p.status} />
                </td>
              </tr>
            ))}
            {(projects ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                  No projects yet.{" "}
                  <Link href="/projects/new" className="underline">
                    Add your first one.
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
