import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { hasPermission, getMyPermissions } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/badge";
import { AsyncActionButton } from "@/components/sync-resumes-button";
import { SaveDraftButton } from "@/components/save-draft-button";
import { ApproverDecisionForm } from "@/components/approver-decision-form";
import { DeleteButton } from "@/components/delete-button";
import { QuarterlyReviewItemRow } from "@/components/quarterly-review-item-row";
import { QuarterlyReviewSummary } from "@/components/quarterly-review-summary";
import { QuarterlyReviewEditableNotes } from "@/components/quarterly-review-editable-notes";
import { QuarterlyReviewHoursField } from "@/components/quarterly-review-hours-field";
import { QuarterlyReviewTicketNumberField } from "@/components/quarterly-review-ticket-number-field";
import { QuarterlyReviewExtraSectionsField } from "@/components/quarterly-review-extra-sections-field";
import { SendReviewToClientForm } from "@/components/send-review-to-client-form";
import { MarkClientAcknowledgedForm } from "@/components/mark-client-acknowledged-form";
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
import {
  QUARTERLY_STATUS_LABELS,
  QUARTERLY_REVIEW_TEMPLATE_LABELS,
  QUARTERLY_REVIEW_EXTRA_SECTIONS,
  getQuarterlyReviewSections,
} from "@/lib/quarterly-review-sections";
import {
  getQuarterlyReview,
  fetchAllClientsForPicker,
  fetchReviewAttachments,
  fetchPreviousReviewSnapshot,
  getQuarterlyReviewApproverEmail,
  fetchQuarterlyReviewSectionPdfs,
} from "@/lib/quarterly-review-data";
import {
  saveQuarterlyReviewItemAction,
  saveQuarterlyReviewSummaryAction,
  saveQuarterlyReviewHoursAction,
  saveQuarterlyReviewTicketNumberAction,
  saveQuarterlyReviewExtraSectionsAction,
  generateQuarterlyReviewSummaryAction,
  saveQuarterlyReviewActionItemsAction,
  generateQuarterlyReviewActionItemsAction,
  saveQuarterlyReviewChangesAction,
  generateQuarterlyReviewChangesAction,
  submitQuarterlyReviewAction,
  approveQuarterlyReviewAction,
  requestQuarterlyReviewAdjustmentAction,
  reopenQuarterlyReviewAction,
  deleteQuarterlyReviewAction,
  sendQuarterlyReviewToClientAction,
  markClientAcknowledgedManuallyAction,
  uploadQuarterlyReviewAttachmentAction,
  deleteQuarterlyReviewAttachmentAction,
  updateQuarterlyReviewAttachmentLabelAction,
} from "../actions";

export const dynamic = "force-dynamic";

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
  avd_virtual_servers_hosts: IconDatabase,
  avd_internet_domains: IconGlobe,
  avd_backups_servers: IconDatabase,
  avd_backups_other: IconRefresh,
  avd_active_directory: IconUsers,
  avd_other_security: IconUsers,
  avd_miscellaneous: IconSliders,
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
  const user = await getCurrentUser();
  const [me, canDelete, approverEmail] = await Promise.all([
    getMyPermissions(supabase),
    hasPermission(supabase, "delete_quarterly_reviews"),
    getQuarterlyReviewApproverEmail(),
  ]);

  const { id } = await params;
  const review = await getQuarterlyReview(id);
  if (!review) notFound();

  const isApprover = (user?.email ?? "").toLowerCase() === approverEmail.toLowerCase();
  const isOwner = me?.role === "owner";
  const canReopen = isOwner || isApprover;
  const itemsLocked = review.status !== "draft";
  // The approver can still tighten up (or regenerate) the summary while a
  // review is submitted and awaiting their decision, without needing to
  // send it back to draft first just to touch the wording.
  const summaryLocked = itemsLocked && !(isApprover && review.status === "submitted");

  const [clients, attachments, previousReview, sectionPdfs] = await Promise.all([
    fetchAllClientsForPicker(),
    fetchReviewAttachments(review.id),
    fetchPreviousReviewSnapshot(review.clientId, review.id),
    fetchQuarterlyReviewSectionPdfs(review.id),
  ]);
  const client = clients.find((c) => c.id === review.clientId);
  const sectionPdfByKey = new Map(sectionPdfs.map((s) => [s.sectionKey, s]));

  const itemStatusByKey = new Map(review.items.map((i) => [i.itemKey, i]));
  const sections = getQuarterlyReviewSections(review.template);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const reviewedItems = sections.reduce(
    (sum, s) => sum + s.items.filter((item) => isItemReviewed(itemStatusByKey.get(item.key))).length,
    0
  );
  const progressPct = totalItems > 0 ? Math.round((reviewedItems / totalItems) * 100) : 0;
  const sectionCounts = sections.map((s) => ({
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
            {sections.map((section) => {
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
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {QUARTERLY_REVIEW_TEMPLATE_LABELS[review.template]} template
              </span>
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
            <QuarterlyReviewExtraSectionsField
              reviewId={review.id}
              value={review.pdfExtraSections}
              action={saveQuarterlyReviewExtraSectionsAction}
            />
            <a
              href={`/api/quarterly-review-pdf-preview/${review.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="self-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Preview PDF
            </a>
            {canDelete && (
              <DeleteButton
                action={deleteQuarterlyReviewAction.bind(null, review.id)}
                confirmText={`Delete this review (${review.clientName} — ${review.reviewPeriod})? This removes it entirely, even though it's already been ${review.status === "sent" ? "sent to the client" : review.status}. This can't be undone.`}
              />
            )}
          </div>
        </div>

      {review.pdfExtraSections.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Extra section PDFs</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Generated as soon as each is checked above — reviewed here, then attached alongside the
            main review PDF when this review is sent to the client.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {review.pdfExtraSections.map((key) => {
              const def = QUARTERLY_REVIEW_EXTRA_SECTIONS.find((s) => s.key === key);
              const generated = sectionPdfByKey.get(key);
              return (
                <span
                  key={key}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium text-slate-700">{def?.label ?? key}</span>
                  {generated ? (
                    <a
                      href={`/api/quarterly-review-section-pdf/${review.id}/${key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand underline"
                    >
                      Preview PDF
                    </a>
                  ) : (
                    <span className="text-slate-400">No data synced yet — nothing to attach.</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

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
            {review.clientAckConfirmedByName
              ? `Recorded by ${review.clientAckConfirmedByName} on ${formatDate(review.clientAcknowledgedAt)} — the client confirmed by email rather than the link.`
              : `${review.clientName} acknowledged this review on ${formatDate(review.clientAcknowledgedAt)}.`}
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

      <QuarterlyReviewEditableNotes
        reviewId={review.id}
        title="Action Items"
        subtitle="Goes to the client. Leave blank to have the PDF list it automatically from the checklist."
        placeholder="One line per item that needs action, or leave blank to auto-generate from the checklist…"
        generateLabel="Generate from checklist"
        value={review.actionItemsNotes}
        disabled={summaryLocked}
        saveAction={saveQuarterlyReviewActionItemsAction}
        generateAction={generateQuarterlyReviewActionItemsAction}
      />

      <QuarterlyReviewEditableNotes
        reviewId={review.id}
        title="Changes Since Last Review"
        subtitle="Goes to the client. Leave blank to have the PDF list it automatically by comparing against the client's previous review."
        placeholder="One line per item that changed since last time, or leave blank to auto-generate…"
        generateLabel="Generate from last review"
        value={review.changesSinceLastReviewNotes}
        disabled={summaryLocked}
        saveAction={saveQuarterlyReviewChangesAction}
        generateAction={generateQuarterlyReviewChangesAction}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {review.status === "draft" && (
          <div className="flex flex-wrap items-center gap-3">
            <SaveDraftButton />
            <AsyncActionButton
              label="Submit for Review"
              pendingLabel="Submitting…"
              action={submitQuarterlyReviewAction.bind(null, review.id)}
              redirectTo="/quarterly-reviews"
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
        {review.status === "sent" && !review.clientAcknowledgedAt && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              {review.reminderCount > 0
                ? `Still unacknowledged — ${review.reminderCount} reminder${review.reminderCount === 1 ? "" : "s"} sent${review.lastReminderAt ? `, last on ${formatDate(review.lastReminderAt)}` : ""}. A weekly reminder keeps going out automatically (Settings → Integrations → Quarterly Review Reminders).`
                : "Not yet acknowledged. A weekly reminder will go out automatically (Settings → Integrations → Quarterly Review Reminders) until it is."}
            </p>
            {isApprover && (
              <div className="mt-2">
                <MarkClientAcknowledgedForm reviewId={review.id} action={markClientAcknowledgedManuallyAction} />
              </div>
            )}
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
        {sections.map((section) => {
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
