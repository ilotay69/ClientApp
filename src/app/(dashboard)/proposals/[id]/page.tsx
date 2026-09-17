import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getProposal, computeProposalBlockers } from "@/lib/proposal-data";
import { Badge } from "@/components/badge";
import { ProposalEngagementPill } from "@/components/proposal-engagement-pill";
import { ProposalSectionEditor } from "@/components/proposal-section-editor";
import { ProposalPricingTable } from "@/components/proposal-pricing-table";
import { InlineDateEdit } from "@/components/task-field-editor";
import { DeleteButton } from "@/components/delete-button";
import { ProposalSendPanel } from "@/components/proposal-send-panel";
import { ProposalProcessingCheckbox } from "@/components/proposal-processing-checkbox";
import { ProposalAiDraft } from "@/components/proposal-ai-draft";
import { ProposalBrochurePicker } from "@/components/proposal-brochure-picker";
import { fetchProposalBrochures, fetchLinkedBrochureIds } from "@/lib/proposal-brochures";
import { getSignedProposalSignatureUrl } from "@/lib/proposal-signature";
import { formatDate } from "@/lib/format";
import { resolveAppUrl } from "@/lib/app-url";
import { formatProposalHeadline, formatMoney } from "@/lib/proposal-totals";
import {
  updateProposalFieldAction,
  updateProposalSectionAction,
  moveProposalSectionAction,
  deleteProposalSectionAction,
  addProposalSectionAction,
  addProposalLineItemAction,
  updateProposalLineItemAction,
  deleteProposalLineItemAction,
  fetchAutotaskCatalogAction,
  addProposalLineItemsFromCatalogAction,
  generateProposalDraftAction,
  applyProposalDraftAction,
  setProposalBrochuresAction,
  deleteProposalAction,
  sendProposalAction,
  getProposalPreviewLinkAction,
  markProposalAcceptedByStaffAction,
  declineProposalAction,
  withdrawProposalAction,
  reviseProposalAction,
  revokeProposalLinkAction,
  setProposalProcessingInternallyAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_proposals"))) redirect("/dashboard");
  const canManage = await hasPermission(supabase, "manage_proposals");

  const proposal = await getProposal(id);
  if (!proposal) notFound();

  const [brochureLibrary, linkedBrochureIds, signatureUrl] = await Promise.all([
    fetchProposalBrochures(),
    fetchLinkedBrochureIds(id),
    getSignedProposalSignatureUrl(proposal.acceptedSignaturePath),
  ]);

  const blockers = computeProposalBlockers(proposal);
  // The Send panel's own Email field is now the only place an address is
  // entered — there's no longer a separate persisted "Recipient email" to
  // check, and the panel already disables Send while that field is empty.
  const sendBlockers = computeProposalBlockers(proposal, { requireStoredEmail: false });
  const isDraft = proposal.status === "draft";
  const editable = canManage && isDraft;

  const writtenSections = proposal.sections.filter((s) => s.body?.trim()).length;
  const readiness = Math.round((writtenSections / Math.max(1, proposal.sections.length)) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/proposals" className="text-xs text-slate-500 hover:text-slate-800">
            ← All proposals
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold text-slate-900">{proposal.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Proposal #{proposal.proposalNumber} ·{" "}
            {proposal.clientName ?? proposal.prospectCompany ?? "No recipient yet"}
            {proposal.prospectContactName ? ` · ${proposal.prospectContactName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProposalEngagementPill
            status={proposal.status}
            viewCount={proposal.viewCount}
            lastViewedAt={proposal.lastViewedAt}
            sentAt={proposal.sentAt}
            validUntil={proposal.validUntil}
            acceptedAt={proposal.acceptedAt}
          />
          {proposal.status !== "sent" && <Badge value={proposal.status} />}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="shrink-0 space-y-4 lg:sticky lg:top-4 lg:w-64">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Proposal readiness
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand" style={{ width: `${readiness}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {writtenSections} of {proposal.sections.length} sections written
            </p>

            <ul className="mt-3 space-y-1">
              {proposal.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#sec-${section.id}`}
                    className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        section.body?.trim() ? "bg-brand" : "bg-slate-300"
                      }`}
                    />
                    <span className="truncate">{section.heading}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {isDraft && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Ready to send
              </p>
              {blockers.length === 0 ? (
                <p className="mt-2 text-xs text-emerald-700">Everything&apos;s in place.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="flex gap-2 text-xs text-slate-600">
                      <span className="text-slate-300">○</span>
                      {blocker}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canManage && (
            <ProposalBrochurePicker
              proposalId={proposal.id}
              library={brochureLibrary}
              initialSelectedIds={linkedBrochureIds}
              disabled={!editable}
              setAction={setProposalBrochuresAction}
            />
          )}

          {canManage && (
            <ProposalSendPanel
              status={proposal.status}
              defaultEmail={proposal.sentToEmail ?? proposal.prospectEmail ?? ""}
              createdByEmail={proposal.createdByEmail}
              blockers={sendBlockers}
              viewUrl={
                proposal.accessToken ? `${resolveAppUrl()}/proposal-view/${proposal.accessToken}` : null
              }
              sentAt={proposal.sentAt}
              sentToEmail={proposal.sentToEmail}
              viewCount={proposal.viewCount}
              lastViewedAt={proposal.lastViewedAt}
              reminderCount={proposal.reminderCount}
              sendAction={sendProposalAction.bind(null, proposal.id)}
              previewAction={getProposalPreviewLinkAction.bind(null, proposal.id)}
              markAcceptedAction={markProposalAcceptedByStaffAction.bind(null, proposal.id)}
              declineAction={declineProposalAction.bind(null, proposal.id)}
              withdrawAction={withdrawProposalAction.bind(null, proposal.id)}
              reviseAction={reviseProposalAction.bind(null, proposal.id)}
              revokeLinkAction={revokeProposalLinkAction.bind(null, proposal.id)}
            />
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Details</p>
            <dl className="mt-2 space-y-2 text-xs">
              <Detail label="Total">
                {formatProposalHeadline(proposal.totals, proposal.currency)}
              </Detail>
              <Detail label="Valid until">
                {editable ? (
                  <InlineDateEdit
                    taskId={proposal.id}
                    field="valid_until"
                    value={proposal.validUntil ?? ""}
                    action={updateProposalFieldAction}
                  />
                ) : (
                  formatDate(proposal.validUntil)
                )}
              </Detail>
              <Detail label="Owner">{proposal.ownerName ?? "—"}</Detail>
              {proposal.sentAt && <Detail label="Sent">{formatDate(proposal.sentAt)}</Detail>}
              {proposal.acceptedAt && (
                <Detail label="Accepted">
                  {formatDate(proposal.acceptedAt)}
                  {proposal.acceptedByName ? ` by ${proposal.acceptedByName}` : ""}
                  {canManage && (
                    <ProposalProcessingCheckbox
                      proposalId={proposal.id}
                      initialChecked={proposal.processingInternally}
                      action={setProposalProcessingInternallyAction}
                    />
                  )}
                </Detail>
              )}
              {proposal.acceptedAt && proposal.acceptedTotalAmount !== null && (
                <Detail label="Agreed total">
                  {formatMoney(proposal.acceptedTotalAmount, proposal.currency)} incl. HST
                </Detail>
              )}
            </dl>
            {proposal.acceptedAt && proposal.acceptedVia === "link" && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400">
                  Accepted online. Authority confirmed:{" "}
                  {proposal.acceptAuthorityConfirmed ? "yes" : "no"}
                  {proposal.acceptedIp && (
                    <>
                      <br />
                      IP address: {proposal.acceptedIp}
                    </>
                  )}
                  {proposal.acceptedUserAgent && (
                    <>
                      <br />
                      Browser: {proposal.acceptedUserAgent}
                    </>
                  )}
                </p>
                {signatureUrl && (
                  <div className="mt-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Signature
                    </p>
                    {/* A signed URL from Supabase Storage — next/image can't
                        optimize an external, expiring URL usefully, so a
                        plain <img> is the right call here. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signatureUrl}
                      alt={`${proposal.acceptedByName ?? "Signature"}`}
                      className="max-h-24 rounded border border-slate-200 bg-white"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Once a proposal is accepted it's a real agreement on record —
              deleting it is off the table; Revise (in the Send panel
              below) is the only way to send an updated round. */}
          {canManage && proposal.status !== "accepted" && (
            <DeleteButton
              action={deleteProposalAction.bind(null, proposal.id)}
              confirmText={`Delete "${proposal.title}"? This can't be undone.`}
              label="Delete proposal"
            />
          )}
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {!isDraft && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This proposal has been sent, so its content is locked — the recipient is reading this
              exact document at their link. Use Revise to put it back into draft.
            </p>
          )}

          {editable && proposal.lineItems.length > 0 && (
            <ProposalAiDraft
              proposalId={proposal.id}
              generateAction={generateProposalDraftAction}
              applyAction={applyProposalDraftAction}
            />
          )}

          {proposal.sections.map((section, index) => (
            <div key={section.id}>
              <ProposalSectionEditor
                section={section}
                index={index}
                total={proposal.sections.length}
                disabled={!editable}
                updateAction={updateProposalSectionAction}
                moveAction={moveProposalSectionAction}
                deleteAction={deleteProposalSectionAction.bind(null, section.id)}
              />
              {section.kind === "pricing" && (
                <div className="mt-4">
                  <ProposalPricingTable
                    proposalId={proposal.id}
                    items={proposal.lineItems}
                    currency={proposal.currency}
                    disabled={!editable}
                    addAction={addProposalLineItemAction}
                    updateAction={updateProposalLineItemAction}
                    deleteAction={deleteProposalLineItemAction}
                    fetchCatalogAction={fetchAutotaskCatalogAction}
                    addFromCatalogAction={addProposalLineItemsFromCatalogAction}
                  />
                </div>
              )}
            </div>
          ))}

          {editable && (
            <form action={addProposalSectionAction.bind(null, proposal.id, "New section")}>
              <button
                type="submit"
                className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700"
              >
                + Add section
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      {/* flex-1 + break-words: a long semicolon-joined email list has no
          whitespace to wrap at, so without these it overflowed past the
          card instead of wrapping onto a second line. */}
      <dd className="min-w-0 flex-1 break-words text-right text-slate-700">{children}</dd>
    </div>
  );
}
