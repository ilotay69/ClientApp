import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import {
  fetchAllReviews,
  reviewBucket,
  reviewActorLabel,
  REVIEW_TABS,
  REVIEW_TAB_LABELS,
  type QuarterlyReview,
  type ReviewTab,
} from "@/lib/quarterly-review-data";

export const dynamic = "force-dynamic";

// Portfolio-wide view — every client's reviews together, unlike the main
// Quarterly Reviews page which is scoped to one client at a time. Meant to
// be opened as its own page/tab (linked with target="_blank" from there).
export default async function AllQuarterlyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_quarterly_reviews"))) {
    redirect("/dashboard");
  }

  const { tab } = await searchParams;
  const activeTab: ReviewTab = tab === "approved" || tab === "sent" ? tab : "incomplete";

  const reviews = await fetchAllReviews();
  const counts: Record<ReviewTab, number> = { incomplete: 0, approved: 0, sent: 0 };
  for (const r of reviews) counts[reviewBucket(r.status)]++;
  const visibleReviews = reviews.filter((r) => reviewBucket(r.status) === activeTab);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/quarterly-reviews" className="text-sm font-medium text-brand underline">
          ← Back to Quarterly Reviews
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Quarterly Reviews — All Clients</h1>
        <p className="mt-1 text-sm text-slate-500">Every client's reviews in one place.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {REVIEW_TABS.map((t) => (
          <Link
            key={t}
            href={`/quarterly-reviews/all?tab=${t}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === t ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
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
            visibleReviews.map((r) => <ReviewRow key={r.id} review={r} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: QuarterlyReview }) {
  return (
    <Link
      href={`/quarterly-reviews/${review.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
    >
      <div>
        <span className="font-medium text-slate-900">{review.clientName}</span>
        <span className="mx-2 text-slate-300">·</span>
        <span className="text-slate-700">{review.reviewPeriod}</span>
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
