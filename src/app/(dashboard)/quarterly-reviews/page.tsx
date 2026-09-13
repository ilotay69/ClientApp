import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import { fetchAllClientsForPicker, fetchReviewsForClient, type QuarterlyReview } from "@/lib/quarterly-review-data";
import { createQuarterlyReviewAction } from "./actions";
import { QuarterlyReviewClientPicker } from "@/components/quarterly-review-client-picker";
import { NewReviewPanel } from "@/components/new-review-panel";

export const dynamic = "force-dynamic";

type ReviewTab = "incomplete" | "approved" | "sent";

const TABS: ReviewTab[] = ["incomplete", "approved", "sent"];
const TAB_LABELS: Record<ReviewTab, string> = {
  incomplete: "Incomplete",
  approved: "Approved",
  sent: "Sent to Client",
};

// A review is only ever in exactly one of these three buckets — "submitted"
// (waiting on the approver) still counts as Incomplete since it isn't done
// yet, it just isn't editable by most staff while it waits.
function bucketOf(status: QuarterlyReview["status"]): ReviewTab {
  if (status === "sent") return "sent";
  if (status === "approved") return "approved";
  return "incomplete";
}

export default async function QuarterlyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; tab?: string }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_quarterly_reviews"))) {
    redirect("/dashboard");
  }

  const { client_id: clientId, tab } = await searchParams;
  const activeTab: ReviewTab = tab === "approved" || tab === "sent" ? tab : "incomplete";

  const clients = await fetchAllClientsForPicker();
  const selectedClient = clientId ? (clients.find((c) => c.id === clientId) ?? null) : null;
  const reviews = selectedClient ? await fetchReviewsForClient(selectedClient.id) : [];

  const counts: Record<ReviewTab, number> = { incomplete: 0, approved: 0, sent: 0 };
  for (const r of reviews) counts[bucketOf(r.status)]++;
  const visibleReviews = reviews.filter((r) => bucketOf(r.status) === activeTab);

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
          <QuarterlyReviewClientPicker clients={clients} selectedId={selectedClient?.id ?? null} tab={activeTab} />
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
          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <Link
                key={t}
                href={`/quarterly-reviews?client_id=${selectedClient.id}&tab=${t}`}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  activeTab === t
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {TAB_LABELS[t]} <span className="text-xs text-slate-400">({counts[t]})</span>
              </Link>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {visibleReviews.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing here.</p>
              ) : (
                visibleReviews.map((r) => <ReviewListRow key={r.id} review={r} />)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Whoever's name is shown here is "the person currently working on it" for
// that status — the creator while it's still a draft, the submitter while
// it waits on approval, then the approver, then whoever actually sent it.
function actorLabel(review: QuarterlyReview): string {
  switch (review.status) {
    case "draft":
      return review.createdByName ? `${review.createdByName} — drafting` : "Drafting";
    case "submitted":
      return review.submittedByName ? `${review.submittedByName} — submitted, awaiting approval` : "Awaiting approval";
    case "approved":
      return review.approvedByName ? `${review.approvedByName} — approved` : "Approved";
    case "sent":
      return review.sentByName ? `${review.sentByName} — sent` : "Sent";
  }
}

function ReviewListRow({ review }: { review: QuarterlyReview }) {
  return (
    <Link
      href={`/quarterly-reviews/${review.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
    >
      <div>
        <span className="font-medium text-slate-900">{review.reviewPeriod}</span>
        <p className="mt-0.5 text-xs text-slate-500">{actorLabel(review)}</p>
      </div>
      <span className="flex items-center gap-3 text-xs text-slate-500">
        {review.hoursSpent !== null && <span>{review.hoursSpent}h</span>}
        <Badge value={review.status} />
        {formatDate(review.createdAt)}
      </span>
    </Link>
  );
}
