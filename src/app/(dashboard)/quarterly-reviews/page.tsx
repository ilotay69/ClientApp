import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import { fetchAllClientsForPicker, fetchReviewsForClient } from "@/lib/quarterly-review-data";
import { createQuarterlyReviewAction } from "./actions";
import { QuarterlyReviewClientPicker } from "@/components/quarterly-review-client-picker";
import { NewReviewPanel } from "@/components/new-review-panel";

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
  const incompleteReviews = reviews.filter((r) => r.status === "draft");
  const pastReviews = reviews.filter((r) => r.status !== "draft");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Quarterly Client Reviews</h1>
        <p className="mt-1 text-sm text-slate-500">We do these quarterly for some clients.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <NewReviewPanel clients={clients} defaultClientId={selectedClient?.id ?? null} action={createQuarterlyReviewAction} />
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Client</label>
          <QuarterlyReviewClientPicker clients={clients} selectedId={selectedClient?.id ?? null} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Existing Reviews{selectedClient ? ` — ${selectedClient.name}` : ""}
        </h2>
        {!selectedClient && <p className="mt-1 text-sm text-slate-500">Choose a client above to see their reviews.</p>}
      </div>

      {selectedClient && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Incomplete</p>
              <p className="mt-0.5 text-xs text-slate-500">Still in draft — pick one up where it was left off.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {incompleteReviews.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing in progress.</p>
              ) : (
                incompleteReviews.map((r) => <ReviewListRow key={r.id} review={r} />)
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Past</p>
            </div>
            <div className="divide-y divide-slate-100">
              {pastReviews.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No reviews yet.</p>
              ) : (
                pastReviews.map((r) => <ReviewListRow key={r.id} review={r} />)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReviewListRow({
  review,
}: {
  review: { id: string; reviewPeriod: string; status: string; createdAt: string; hoursSpent: number | null };
}) {
  return (
    <Link
      href={`/quarterly-reviews/${review.id}`}
      className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50"
    >
      <span className="font-medium text-slate-900">{review.reviewPeriod}</span>
      <span className="flex items-center gap-3 text-xs text-slate-500">
        {review.hoursSpent !== null && <span>{review.hoursSpent}h</span>}
        <Badge value={review.status} />
        {formatDate(review.createdAt)}
      </span>
    </Link>
  );
}
