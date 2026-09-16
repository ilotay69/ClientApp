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
  fetchOpenQuarterlyReviewSlaTicketsForDisplay,
  reviewBucket,
  reviewActorLabel,
  REVIEW_TABS,
  REVIEW_TAB_LABELS,
  getQuarterlyReviewApproverEmail,
  type QuarterlyReview,
  type ReviewTab,
} from "@/lib/quarterly-review-data";
import { createQuarterlyReviewAction, fetchOpenQuarterlyReviewTicketsAction } from "./actions";
import { QuarterlyReviewClientPicker } from "@/components/quarterly-review-client-picker";
import { NewReviewPanel } from "@/components/new-review-panel";

export const dynamic = "force-dynamic";

export default async function QuarterlyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; tab?: string; my_tab?: string }>;
}) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_quarterly_reviews"))) {
    redirect("/dashboard");
  }

  const { client_id: clientId, tab, my_tab: myTabParam } = await searchParams;
  const activeTab: ReviewTab = tab === "approved" || tab === "sent" ? tab : "incomplete";
  const activeMyTab: ReviewTab = myTabParam === "approved" || myTabParam === "sent" ? myTabParam : "incomplete";

  // Preserves whichever other query params are already set (client_id/tab
  // for the per-client list below, my_tab for the My Reviews tabs above it)
  // when a link only means to change one of them.
  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (clientId) params.set("client_id", clientId);
    if (tab) params.set("tab", tab);
    if (myTabParam) params.set("my_tab", myTabParam);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    return `/quarterly-reviews?${params.toString()}`;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, autotask_resource_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const [clients, allReviews, approverEmail, slaTickets] = await Promise.all([
    fetchAllClientsForPicker(),
    fetchAllReviews(),
    getQuarterlyReviewApproverEmail(),
    fetchOpenQuarterlyReviewSlaTicketsForDisplay({
      fullName: me?.full_name ?? null,
      autotaskResourceId: me?.autotask_resource_id ?? null,
    }),
  ]);
  const isApprover = (user?.email ?? "").toLowerCase() === approverEmail.toLowerCase();
  const selectedClient = clientId ? (clients.find((c) => c.id === clientId) ?? null) : null;
  const reviews = selectedClient ? await fetchReviewsForClient(selectedClient.id) : [];

  const counts: Record<ReviewTab, number> = { incomplete: 0, approved: 0, sent: 0 };
  for (const r of reviews) counts[reviewBucket(r.status)]++;
  const visibleReviews = reviews.filter((r) => reviewBucket(r.status) === activeTab);

  // Cross-client — "what am I actually on the hook for right now": every
  // draft/submitted/approved review I created (always), anything sitting
  // in my approval queue, and — so a sent review is never just invisible —
  // my last 10 sent reviews regardless of whether the client's responded.
  let myReviews: QuarterlyReview[] = [];
  if (user?.id) {
    const mine = allReviews.filter((r) => r.createdById === user.id);
    const myActive = mine.filter((r) => reviewBucket(r.status) !== "sent");
    const myPendingApproval = isApprover ? allReviews.filter((r) => r.status === "submitted") : [];
    const mySent = mine
      .filter((r) => r.status === "sent")
      .sort((a, b) => new Date(b.sentAt ?? b.createdAt).getTime() - new Date(a.sentAt ?? a.createdAt).getTime())
      .slice(0, 10);

    const byId = new Map<string, QuarterlyReview>();
    for (const r of [...myActive, ...myPendingApproval, ...mySent]) byId.set(r.id, r);
    myReviews = [...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  const myCounts: Record<ReviewTab, number> = { incomplete: 0, approved: 0, sent: 0 };
  for (const r of myReviews) myCounts[reviewBucket(r.status)]++;
  const visibleMyReviews = myReviews.filter((r) => reviewBucket(r.status) === activeMyTab);

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

      <NewReviewPanel
        clients={clients}
        defaultClientId={selectedClient?.id ?? null}
        action={createQuarterlyReviewAction}
        fetchOpenTicketsAction={fetchOpenQuarterlyReviewTicketsAction}
        slaTickets={slaTickets}
      />

      {myReviews.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">My Reviews</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your drafts and approved reviews, anything awaiting your approval, and your last 10 sent.
          </p>

          <div className="mt-3 flex gap-1 border-b border-slate-200">
            {REVIEW_TABS.map((t) => (
              <Link
                key={t}
                href={buildHref({ my_tab: t })}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  activeMyTab === t
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {REVIEW_TAB_LABELS[t]} <span className="text-xs text-slate-400">({myCounts[t]})</span>
              </Link>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {visibleMyReviews.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing here.</p>
              ) : (
                visibleMyReviews.map((r) => (
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
                    <ReviewStatusPill review={r} />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Existing Reviews{selectedClient ? ` — ${selectedClient.name}` : ""}
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Client</label>
          <div className="w-56">
            <QuarterlyReviewClientPicker clients={clients} selectedId={selectedClient?.id ?? null} tab={activeTab} />
          </div>
        </div>
        {!selectedClient && <p className="mt-2 text-sm text-slate-500">Choose a client above to see their reviews.</p>}
      </div>

      {selectedClient && (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {REVIEW_TABS.map((t) => (
              <Link
                key={t}
                href={buildHref({ client_id: selectedClient.id, tab: t })}
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
        <ReviewStatusPill review={review} />
        {formatDate(review.createdAt)}
      </span>
    </Link>
  );
}

/** A review sitting at "draft" with unresolved adjustmentNotes just got sent
 * back by the approver — plain reviewBucket/Badge can't tell that apart
 * from a review that was never submitted, so this checks for that
 * specifically before falling back to the plain status badge. Also covers
 * the "sent" pills (client acknowledged / reminder count) shared between
 * My Reviews and the per-client list, so both stay in sync. */
function ReviewStatusPill({ review }: { review: QuarterlyReview }) {
  if (review.status === "sent" && review.clientAcknowledgedAt) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Client acknowledged
      </span>
    );
  }
  if (review.status === "sent" && review.reminderCount > 0) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
        Awaiting ack — reminder {review.reminderCount} sent
      </span>
    );
  }
  if (review.status === "draft" && review.adjustmentNotes) {
    return <Badge value="needs_adjustment" label="Needs Adjustment" />;
  }
  return <Badge value={review.status} />;
}
