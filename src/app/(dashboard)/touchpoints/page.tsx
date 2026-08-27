import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { formatDate, isOverdue } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TouchpointsPage() {
  const supabase = await createClient();
  const { data: touchpoints } = await supabase
    .from("touchpoints")
    .select("id, type, due_date, completed_at, clients(name)")
    .order("due_date", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Touchpoints</h1>
        <Link
          href="/touchpoints/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New touchpoint
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Client</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Type</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Due date</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(touchpoints ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/touchpoints/${t.id}`} className="font-medium text-slate-900 hover:underline">
                    {(t.clients as unknown as { name: string } | null)?.name ?? "—"}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <Badge value={t.type} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">{formatDate(t.due_date)}</span>
                    {!t.completed_at && isOverdue(t.due_date) && <OverdueBadge />}
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {t.completed_at ? `Completed ${formatDate(t.completed_at)}` : "Not completed"}
                </td>
              </tr>
            ))}
            {(touchpoints ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                  No touchpoints scheduled.{" "}
                  <Link href="/touchpoints/new" className="underline">
                    Schedule your first one.
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
