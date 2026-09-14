import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import {
  fetchAllClientsForPicker,
  fetchReviewsForClient,
  fetchAllReviews,
  reviewBucket,
  reviewActorLabel,
  REVIEW_TABS,
  REVIEW_TAB_LABELS,
  QUARTERLY_REVIEW_APPROVER_EMAIL,
  type QuarterlyReview,
  type ReviewTab,
} from "@/lib/quarterly-review-data";
import { createQuarterlyReviewAction } from "./actions";
import { QuarterlyReviewClientPicker } from "@/components/quarterly-review-client-picker";
import { NewReviewPanel } from "@/components/new-review-panel";

export const dynamic = "force-dynamic";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isApprover = (user?.email ?? "").toLowerCase() === QUARTERLY_REVIEW_APPROVER_EMAIL.toLowerCase();

  const [clients, allReviews] = await Promise.all([fetchAllClientsForPicker(), fetchAllReviews()]);
  const selectedClient = clientId ? (clients.find((c) => c.id === clientId) ?? null) : null;
  const reviews = selectedClient ? await fetchReviewsForClient(selectedClient.id) : [];

  const counts: Record<ReviewTab, number> = { incomplete: 0, approved: 0, sent: 0 };
  for (const r of reviews) counts[reviewBucket(r.status)]++;
  const visibleReviews = reviews.filter((r) => reviewBucket(r.status) === activeTab);

  // Cross-client — "what am I actually on the hook for right now": reviews
  // still incomplete or awaiting a decision that either I created, or (if
  // I'm the approver) are sitting in my queue — plus, for ones I created,
  // a "sent" review the client has actually responded to (acknowledged or
  // asked to discuss). A "sent" review nobody's responded to yet is still
  // excluded: there's genuinely nothing left to do on it.
  const myReviews = (user?.id
    ? allReviews.filter((r) => {
        const isMine = r.createdById === user.id;
        const isPendingMyApproval = isApprover && r.status === "submitted";
        const clientResponded = r.status === "sent" && r.clientAcknowledgedAt !== null;
        return isPendingMyApproval || (isMine && (reviewBucket(r.status) !== "sent" || clientResponded));
      })
    : []
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quarterly Client Reviews</h1>
          <p className="mt-1 text-sm text-slate-500">We do these quarterly for some clients.</p>
        </div>
        <Link
          href="/quarterly-reviews/all"
          className="whitespace-nowrap text-sm font-medium text-brand underline"
        >
          View all clients →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <NewReviewPanel clients={clients} defaultClientId={selectedClient?.id ?? null} action={createQuarterlyReviewAction} />
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Client</label>
          <div className="w-56">
            <QuarterlyReviewClientPicker clients={clients} selectedId={selectedClient?.id ?? null} tab={activeTab} />
          </div>
        </div>
      </div>

      {myReviews.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">My Reviews</h2>
          <p className="mt-1 text-sm text-slate-500">
            Reviews you created or need to approve, plus any sent review the client has responded to.
          </p>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {myReviews.map((r) => (
                <Link
                  key={r.id}
                  href={`/quarterly-reviews/${r.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
                >
                  <div>
                    <span className="font-medium text-slate-900">{r.clientName}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="text-slate-700">{r.reviewPeriod}</span>
                  </div>
                  {r.status === "sent" && r.clientAcknowledgedAt ? (
                    r.clientAckRemarks ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        Client wants to discuss
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        Client acknowledged
                      </span>
                    )
                  ) : (
                    <Badge value={r.status} />
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Existing Reviews{selectedClient ? ` — ${selectedClient.name}` : ""}
        </h2>
        {!selectedClient && <p className="mt-1 text-sm text-slate-500">Choose a client above to see their reviews.</p>}
      </div>

      {selectedClient && (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {REVIEW_TABS.map((t) => (
              <Link
                key={t}
                href={`/quarterly-reviews?client_id=${selectedClient.id}&tab=${t}`}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  activeTab === t
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {REVIEW_TAB_LABELS[t]} <span className="text-xs text-slate-400">({counts[t]})</span>
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

function ReviewListRow({ review }: { review: QuarterlyReview }) {
  return (
    <Link
      href={`/quarterly-reviews/${review.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
    >
      <div>
        <span className="font-medium text-slate-900">{review.reviewPeriod}</span>
        <p className="mt-0.5 text-xs text-slate-500">{reviewActorLabel(review)}</p>
      </div>
      <span className="flex items-center gap-3 text-xs text-slate-500">
        {review.hoursSpent !== null && <span>{review.hoursSpent}h</span>}
        <Badge value={review.status} />
        {formatDate(review.createdAt)}
      </span>
    </Link>
  );
}
