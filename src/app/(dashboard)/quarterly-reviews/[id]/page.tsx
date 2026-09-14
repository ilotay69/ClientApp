import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, getMyPermissions } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import { AsyncActionButton } from "@/components/sync-resumes-button";
import { SaveDraftButton } from "@/components/save-draft-button";
import { ApproverDecisionForm } from "@/components/approver-decision-form";
import { DeleteButton } from "@/components/delete-button";
import { QuarterlyReviewItemRow } from "@/components/quarterly-review-item-row";
import { QuarterlyReviewSummary } from "@/components/quarterly-review-summary";
import { QuarterlyReviewHoursField } from "@/components/quarterly-review-hours-field";
import { QuarterlyReviewTicketNumberField } from "@/components/quarterly-review-ticket-number-field";
import { SendReviewToClientForm } from "@/components/send-review-to-client-form";
import { QuarterlyReviewScreenshots } from "@/components/quarterly-review-screenshots";
import {
  IconDatabase,
  IconMonitor,
  IconNetwork,
  IconGlobe,
  IconRefresh,
  IconUsers,
  IconSliders,
  IconClipboardCheck,
} from "@/components/icons";
import { QUARTERLY_REVIEW_SECTIONS, QUARTERLY_STATUS_LABELS } from "@/lib/quarterly-review-sections";
import {
  getQuarterlyReview,
  fetchAllClientsForPicker,
  fetchReviewAttachments,
  fetchPreviousReviewSnapshot,
  QUARTERLY_REVIEW_APPROVER_EMAIL,
} from "@/lib/quarterly-review-data";
import {
  saveQuarterlyReviewItemAction,
  saveQuarterlyReviewSummaryAction,
  saveQuarterlyReviewHoursAction,
  saveQuarterlyReviewTicketNumberAction,
  generateQuarterlyReviewSummaryAction,
  submitQuarterlyReviewAction,
  approveQuarterlyReviewAction,
  requestQuarterlyReviewAdjustmentAction,
  reopenQuarterlyReviewAction,
  deleteQuarterlyReviewAction,
  sendQuarterlyReviewToClientAction,
  uploadQuarterlyReviewAttachmentAction,
  deleteQuarterlyReviewAttachmentAction,
  updateQuarterlyReviewAttachmentLabelAction,
} from "../actions";

export const dynamic = "force-dynamic";

// Single source of truth in quarterly-review-data.ts — only this exact
// account sees the Approve button at all (not a permission).
const APPROVER_EMAIL = QUARTERLY_REVIEW_APPROVER_EMAIL;

// Purely a display concern (which icon a section gets in the left-rail
// nav and its own header) — kept here rather than in
// quarterly-review-sections.ts, which is deliberately import-free so it
// stays safe to use from both server code (the PDF/email) and client
// components.
const SECTION_ICONS: Record<string, (props: { className?: string }) => React.ReactNode> = {
  physical_servers: IconDatabase,
  virtual_servers: IconDatabase,
  workstations: IconMonitor,
  network_devices: IconNetwork,
  internet_domains: IconGlobe,
  backups_servers: IconDatabase,
  backups_other: IconRefresh,
  active_directory: IconUsers,
  miscellaneous: IconSliders,
};

/** An item counts as "reviewed" once it's been touched at all — moved off
 * the default N/A, or left with a comment (covering a deliberate,
 * commented-on N/A). There's no separate "seen it" flag in the schema, so
 * this is an approximation, not an exact log of what a tech has actually
 * looked at. */
function isItemReviewed(row: { status: string; comments: string | null } | undefined): boolean {
  if (!row) return false;
  return row.status !== "na" || Boolean(row.comments);
}

export default async function QuarterlyReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_quarterly_reviews"))) {
    redirect("/dashboard");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [me, canDelete] = await Promise.all([getMyPermissions(supabase), hasPermission(supabase, "delete_quarterly_reviews")]);

  const { id } = await params;
  const review = await getQuarterlyReview(id);
  if (!review) notFound();

  const isApprover = (user?.email ?? "").toLowerCase() === APPROVER_EMAIL.toLowerCase();
  const isOwner = me?.role === "owner";
  const canReopen = isOwner || isApprover;
  const itemsLocked = review.status !== "draft";
  // The approver can still tighten up (or regenerate) the summary while a
  // review is submitted and awaiting their decision, without needing to
  // send it back to draft first just to touch the wording.
  const summaryLocked = itemsLocked && !(isApprover && review.status === "submitted");

  const [clients, attachments, previousReview] = await Promise.all([
    fetchAllClientsForPicker(),
    fetchReviewAttachments(review.id),
    fetchPreviousReviewSnapshot(review.clientId, review.id),
  ]);
  const client = clients.find((c) => c.id === review.clientId);

  const itemStatusByKey = new Map(review.items.map((i) => [i.itemKey, i]));

  const totalItems = QUARTERLY_REVIEW_SECTIONS.reduce((sum, s) => sum + s.items.length, 0);
  const reviewedItems = QUARTERLY_REVIEW_SECTIONS.reduce(
    (sum, s) => sum + s.items.filter((item) => isItemReviewed(itemStatusByKey.get(item.key))).length,
    0
  );
  const progressPct = totalItems > 0 ? Math.round((reviewedItems / totalItems) * 100) : 0;
  const sectionCounts = QUARTERLY_REVIEW_SECTIONS.map((s) => ({
    key: s.key,
    reviewed: s.items.filter((item) => isItemReviewed(itemStatusByKey.get(item.key))).length,
    total: s.items.length,
  }));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="shrink-0 space-y-4 lg:sticky lg:top-4 lg:w-64">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-900">Review progress</span>
            <span className="font-semibold text-brand">{progressPct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {reviewedItems} of {totalItems} checks reviewed
          </p>
        </div>

        <nav className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Review sections</p>
          <ul className="space-y-0.5">
            {QUARTERLY_REVIEW_SECTIONS.map((section) => {
              const Icon = SECTION_ICONS[section.key] ?? IconSliders;
              const count = sectionCounts.find((c) => c.key === section.key);
              return (
                <li key={section.key}>
                  <a
                    href={`#${section.key}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{section.label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {count?.reviewed ?? 0}/{count?.total ?? 0}
                    </span>
                  </a>
                </li>
              );
            })}
            <li>
              <a
                href="#screenshots"
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <IconClipboardCheck className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">Screenshots</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{attachments.length}</span>
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
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
          <div className="flex items-start gap-3">
            <QuarterlyReviewHoursField
              reviewId={review.id}
              value={review.hoursSpent}
              action={saveQuarterlyReviewHoursAction}
            />
            <QuarterlyReviewTicketNumberField
              reviewId={review.id}
              value={review.ticketNumber}
              action={saveQuarterlyReviewTicketNumberAction}
            />
            {canDelete && (
              <DeleteButton
                action={deleteQuarterlyReviewAction.bind(null, review.id)}
                confirmText={`Delete this review (${review.clientName} — ${review.reviewPeriod})? This removes it entirely, even though it's already been ${review.status === "sent" ? "sent to the client" : review.status}. This can't be undone.`}
              />
            )}
          </div>
        </div>

      {review.adjustmentNotes && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Needs Adjustment</p>
          <p className="mt-1 text-xs text-amber-700">
            {review.adjustmentRequestedByName ?? "The approver"} requested changes
            {review.adjustmentRequestedAt ? ` on ${formatDate(review.adjustmentRequestedAt)}` : ""}:
          </p>
          <p className="mt-2 whitespace-pre-line text-sm text-amber-900">{review.adjustmentNotes}</p>
        </div>
      )}

      {review.clientAcknowledgedAt && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Client Acknowledged</p>
          <p className="mt-1 text-xs text-emerald-700">
            {review.clientName} acknowledged this review on {formatDate(review.clientAcknowledgedAt)}
            {review.clientAckRemarks ? ":" : "."}
          </p>
          {review.clientAckRemarks && (
            <p className="mt-2 whitespace-pre-line text-sm text-emerald-900">{review.clientAckRemarks}</p>
          )}
        </div>
      )}

      <QuarterlyReviewSummary
        reviewId={review.id}
        value={review.summary}
        disabled={summaryLocked}
        saveAction={saveQuarterlyReviewSummaryAction}
        generateAction={generateQuarterlyReviewSummaryAction}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {review.status === "draft" && (
          <div className="flex flex-wrap items-center gap-3">
            <SaveDraftButton />
            <AsyncActionButton
              label="Submit for Review"
              pendingLabel="Submitting…"
              action={submitQuarterlyReviewAction.bind(null, review.id)}
            />
          </div>
        )}
        {review.status === "submitted" && !isApprover && (
          <p className="text-sm text-slate-500">Waiting for approval.</p>
        )}
        {review.status === "submitted" && isApprover && (
          <ApproverDecisionForm
            reviewId={review.id}
            approveAction={approveQuarterlyReviewAction}
            requestAdjustmentAction={requestQuarterlyReviewAdjustmentAction}
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
        {canReopen && itemsLocked && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <AsyncActionButton
              label="Reopen for editing"
              pendingLabel="Reopening…"
              action={reopenQuarterlyReviewAction.bind(null, review.id)}
            />
          </div>
        )}
      </div>

      {itemsLocked && (
        <p className="text-xs text-slate-500">
          This review has been {review.status} — items are locked.
          {canReopen ? " Use “Reopen for editing” above if something needs correcting." : " Ask an Owner or the approver to reopen it if something needs correcting."}
        </p>
      )}

      <div className="space-y-4">
        {QUARTERLY_REVIEW_SECTIONS.map((section) => {
          const previousRows = previousReview
            ? section.items
                .map((item) => ({ item, prev: previousReview.itemsByKey.get(item.key) }))
                .filter((r) => r.prev && (r.prev.status !== "na" || r.prev.comments))
            : [];
          const SectionIcon = SECTION_ICONS[section.key] ?? IconSliders;
          return (
            <div key={section.key} id={section.key} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <SectionIcon className="h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{section.label}</p>
                  <p className="text-xs text-slate-500">{section.description}</p>
                </div>
              </div>
              <div>
                {section.items.map((item, i) => {
                  const row = itemStatusByKey.get(item.key);
                  return (
                    <QuarterlyReviewItemRow
                      key={item.key}
                      index={i + 1}
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
              {previousReview && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium text-slate-500">
                    From last review ({previousReview.reviewPeriod}) — staff/approver only, never sent to the
                    client:
                  </p>
                  {previousRows.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-400">Nothing notable in this section last time.</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {previousRows.map(({ item, prev }) => (
                        <li key={item.key} className="text-xs text-slate-500">
                          {item.label}: {QUARTERLY_STATUS_LABELS[prev!.status]}
                          {prev!.comments ? ` — ${prev!.comments}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div id="screenshots" className="scroll-mt-4">
        <QuarterlyReviewScreenshots
          reviewId={review.id}
          attachments={attachments}
          disabled={itemsLocked}
          uploadAction={uploadQuarterlyReviewAttachmentAction}
          deleteAction={deleteQuarterlyReviewAttachmentAction}
          updateLabelAction={updateQuarterlyReviewAttachmentLabelAction}
        />
      </div>
      </div>
    </div>
  );
}
