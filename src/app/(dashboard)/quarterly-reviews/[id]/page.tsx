import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import { AsyncActionButton } from "@/components/sync-resumes-button";
import { QuarterlyReviewItemRow } from "@/components/quarterly-review-item-row";
import { SendReviewToClientForm } from "@/components/send-review-to-client-form";
import { QUARTERLY_REVIEW_SECTIONS } from "@/lib/quarterly-review-sections";
import { getQuarterlyReview, fetchAllClientsForPicker } from "@/lib/quarterly-review-data";
import {
  saveQuarterlyReviewItemAction,
  submitQuarterlyReviewAction,
  approveQuarterlyReviewAction,
  sendQuarterlyReviewToClientAction,
} from "../actions";

export const dynamic = "force-dynamic";

// Kept in sync with the same constant in ../actions.ts — only this exact
// account sees the Approve button at all (not a permission).
const APPROVER_EMAIL = "ilotay@cgtechnologies.com";

export default async function QuarterlyReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_quarterly_reviews"))) {
    redirect("/dashboard");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { id } = await params;
  const review = await getQuarterlyReview(id);
  if (!review) notFound();

  const isApprover = (user?.email ?? "").toLowerCase() === APPROVER_EMAIL.toLowerCase();
  const itemsLocked = review.status !== "draft";

  const clients = await fetchAllClientsForPicker();
  const client = clients.find((c) => c.id === review.clientId);

  const itemStatusByKey = new Map(review.items.map((i) => [i.itemKey, i]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/quarterly-reviews" className="text-sm font-medium text-brand underline">
          ← Back to Quarterly Reviews
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">
            {review.clientName} — {review.reviewPeriod}
          </h1>
          <Badge value={review.status} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Created {formatDate(review.createdAt)}
          {review.createdByName ? ` by ${review.createdByName}` : ""}
          {review.submittedAt ? ` · Submitted ${formatDate(review.submittedAt)}` : ""}
          {review.approvedAt ? ` · Approved ${formatDate(review.approvedAt)}${review.approvedByName ? ` by ${review.approvedByName}` : ""}` : ""}
          {review.sentAt ? ` · Sent ${formatDate(review.sentAt)} to ${review.sentToEmail}` : ""}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {review.status === "draft" && (
          <AsyncActionButton
            label="Submit for Review"
            pendingLabel="Submitting…"
            action={submitQuarterlyReviewAction.bind(null, review.id)}
          />
        )}
        {review.status === "submitted" && !isApprover && (
          <p className="text-sm text-slate-500">Waiting for approval.</p>
        )}
        {review.status === "submitted" && isApprover && (
          <AsyncActionButton
            label="Approve"
            pendingLabel="Approving…"
            action={approveQuarterlyReviewAction.bind(null, review.id)}
          />
        )}
        {(review.status === "approved" || review.status === "sent") && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">
              Send to client — a plain text box for now, as a test, rather than a fixed contact:
            </p>
            <SendReviewToClientForm
              reviewId={review.id}
              defaultEmail={client?.primaryContactEmail ?? null}
              action={sendQuarterlyReviewToClientAction}
            />
          </div>
        )}
      </div>

      {itemsLocked && (
        <p className="text-xs text-slate-500">
          This review has been submitted — items are locked. (Editing after approval isn&apos;t
          wired up yet; ask an Owner if something needs correcting.)
        </p>
      )}

      <div className="space-y-4">
        {QUARTERLY_REVIEW_SECTIONS.map((section) => (
          <div key={section.key} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
              <p className="text-sm font-semibold text-slate-900">{section.label}</p>
            </div>
            <div>
              {section.items.map((item) => {
                const row = itemStatusByKey.get(item.key);
                return (
                  <QuarterlyReviewItemRow
                    key={item.key}
                    reviewId={review.id}
                    itemKey={item.key}
                    label={item.label}
                    status={row?.status ?? "na"}
                    comments={row?.comments ?? null}
                    disabled={itemsLocked}
                    action={saveQuarterlyReviewItemAction}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
