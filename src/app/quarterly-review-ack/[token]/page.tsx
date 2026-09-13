import { getQuarterlyReviewByAckToken } from "@/lib/quarterly-review-data";
import { AcknowledgeReviewForm } from "@/components/acknowledge-review-form";
import { acknowledgeReviewByTokenAction } from "./actions";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Public — no login of any kind. Reached via one of the two links in the
// client-facing email (see buildQuarterlyReviewClientEmail), keyed by a
// random, unguessable token rather than the review's own id. See
// src/lib/supabase/middleware.ts's PUBLIC_PREFIX_PATHS for why this route
// is excluded from the normal login gate. ?discuss=1 (the email's "Need to
// Discuss" link) just pre-opens the remarks field below — it doesn't skip
// the button click that actually submits anything.
export default async function QuarterlyReviewAckPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ discuss?: string }>;
}) {
  const { token } = await params;
  const { discuss } = await searchParams;
  const review = await getQuarterlyReviewByAckToken(token);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {!review ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Link not valid</h1>
            <p className="mt-2 text-sm text-slate-500">
              This acknowledgment link isn&apos;t valid — it may have been replaced by a newer version of the
              review. Contact CG Technologies if you need a new one.
            </p>
          </>
        ) : review.alreadyAcknowledged ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Already acknowledged</h1>
            <p className="mt-2 text-sm text-slate-500">
              {review.clientName} — {review.reviewPeriod} was acknowledged
              {review.acknowledgedAt ? ` on ${formatDate(review.acknowledgedAt)}` : ""}.
            </p>
            {review.remarks && (
              <p className="mt-3 whitespace-pre-line rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                {review.remarks}
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Your Quarterly Systems Review</h1>
            <p className="mt-2 text-sm text-slate-500">
              {review.clientName} — {review.reviewPeriod}
            </p>
            <p className="mt-4 text-sm text-slate-600">
              Some items in this review may need attention. <strong>Acknowledge</strong> confirms you&apos;ve
              received it and accept the risk of any outstanding items not being addressed. If you&apos;d
              rather discuss any of the items first, choose <strong>Need to Discuss</strong> and add a
              note.
            </p>
            <AcknowledgeReviewForm
              token={token}
              action={acknowledgeReviewByTokenAction}
              initialMode={discuss === "1" ? "discuss" : "choose"}
            />
          </>
        )}
      </div>
    </div>
  );
}
