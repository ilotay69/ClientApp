import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { formatCurrency, formatDate, isOverdue } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const supabase = await createClient();
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, title, status, amount, follow_up_due_date, clients(name)")
    .order("follow_up_due_date", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Quotes</h1>
        <Link
          href="/quotes/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New quote
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Title</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Client</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Amount</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Follow-up due</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(quotes ?? []).map((q) => (
              <tr key={q.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/quotes/${q.id}`} className="font-medium text-slate-900 hover:underline">
                    {q.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {(q.clients as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-5 py-3 text-slate-600">{formatCurrency(q.amount)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">{formatDate(q.follow_up_due_date)}</span>
                    {isOverdue(q.follow_up_due_date) &&
                      ["sent", "follow_up_needed"].includes(q.status) && <OverdueBadge />}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge value={q.status} />
                </td>
              </tr>
            ))}
            {(quotes ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                  No quotes yet.{" "}
                  <Link href="/quotes/new" className="underline">
                    Log your first one.
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
