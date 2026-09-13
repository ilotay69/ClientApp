import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import { fetchAllClientsForPicker, fetchReviewsForClient } from "@/lib/quarterly-review-data";
import { createQuarterlyReviewAction } from "./actions";
import { QuarterlyReviewClientPicker } from "@/components/quarterly-review-client-picker";
import { NewQuarterlyReviewForm } from "@/components/new-quarterly-review-form";

export const dynamic = "force-dynamic";

export default async function QuarterlyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_quarterly_reviews"))) {
    redirect("/dashboard");
  }

  const { client_id: clientId } = await searchParams;

  const clients = await fetchAllClientsForPicker();
  const selectedClient = clientId ? (clients.find((c) => c.id === clientId) ?? null) : null;
  const reviews = selectedClient ? await fetchReviewsForClient(selectedClient.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Quarterly Client Reviews</h1>
        <p className="mt-1 text-sm text-slate-500">
          We do these quarterly for some clients — pick a client to see their past reviews, or
          start a new one below.
        </p>
      </div>

      <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">Client</label>
        <div className="mt-1">
          <QuarterlyReviewClientPicker clients={clients} selectedId={selectedClient?.id ?? null} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Start a new review</p>
        <div className="mt-2">
          <NewQuarterlyReviewForm
            clients={clients}
            defaultClientId={selectedClient?.id ?? null}
            action={createQuarterlyReviewAction}
          />
        </div>
      </div>

      {selectedClient && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Past reviews for {selectedClient.name}</p>
          </div>
          <div className="divide-y divide-slate-100">
            {reviews.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No reviews yet.</p>
            ) : (
              reviews.map((r) => (
                <Link
                  key={r.id}
                  href={`/quarterly-reviews/${r.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{r.reviewPeriod}</span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    <Badge value={r.status} />
                    {formatDate(r.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
