import { getQuarterlyReviewByAckToken } from "@/lib/quarterly-review-data";
import { AcknowledgeReviewForm } from "@/components/acknowledge-review-form";
import { acknowledgeReviewByTokenAction } from "./actions";
import { formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";
import { getEmailTemplate, applyTemplateVars } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

// Public — no login of any kind. Reached via the link in the client-facing
// email (see buildQuarterlyReviewClientEmail) and its weekly reminder
// resends, keyed by a random, unguessable token rather than the review's
// own id. See src/lib/supabase/middleware.ts's PUBLIC_PREFIX_PATHS for why
// this route is excluded from the normal login gate.
export default async function QuarterlyReviewAckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const review = await getQuarterlyReviewByAckToken(token);

  // The same configured note the email itself carries, rather than a second
  // copy of that sentence hardcoded here. This page used to tell clients to
  // "reply to the email this link came from" long after the email had been
  // changed to point them at a helpdesk ticket — two places saying
  // different things because only one of them was editable. Now there's one
  // source: Settings -> Integrations -> Email Templates -> Quarterly Review.
  const template = review ? await getEmailTemplate(createAdminClient(), "quarterly_review") : null;
  const note =
    template && review
      ? applyTemplateVars(template.note, {
          client_name: review.clientName,
          review_period: review.reviewPeriod,
        })
      : "";

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
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Your Quarterly Systems Review</h1>
            <p className="mt-2 text-sm text-slate-500">
              {review.clientName} — {review.reviewPeriod}
            </p>
            <p className="mt-4 text-sm text-slate-600">
              Some items in this review may need attention.{note ? ` ${note}` : ""}
            </p>
            {/* Its own sentence rather than an "Otherwise, ..." clause tacked
                onto the note above — the note is free text an owner can
                rewrite at any time, and a connective referring back to it
                would stop making sense the moment they did. */}
            <p className="mt-2 text-sm text-slate-600">
              Please <strong>Acknowledge</strong> below to confirm you&apos;ve received it and accept
              the risk of any outstanding items not being addressed.
            </p>
            <AcknowledgeReviewForm token={token} action={acknowledgeReviewByTokenAction} />
          </>
        )}
      </div>
    </div>
  );
}
