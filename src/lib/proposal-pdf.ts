import { PdfContentBuilder } from "@/lib/pdf";
import { formatDate } from "@/lib/format";
import { formatMoney, lineTotal } from "@/lib/proposal-totals";
import type { Proposal } from "@/lib/proposal-data";
import type { CompanyInfo } from "@/lib/company-info";

const NAVY: [number, number, number] = [0.059, 0.09, 0.165];

const PERIOD_SUFFIX: Record<string, string> = {
  monthly: "/mo",
  annual: "/yr",
  one_off: "",
};

/** The complete signed copy sent to a client once they accept: the same
 * sections/pricing they read on the acceptance page, plus the acceptance
 * record and their drawn signature, laid out as a standalone document
 * rather than an internal report. Uses whatever's on the Proposal object
 * right now, so it must be called with a freshly-reloaded proposal (post-
 * acceptance), not the pre-accept snapshot the accept action started
 * with - otherwise accepted_at/accepted_by_name/the signature path are
 * still null on it. */
export function buildProposalPdf(
  proposal: Proposal,
  signatureBuffer: Buffer | null,
  companyInfo: CompanyInfo
): { pdf: Buffer; embeddedImageIds: Set<string> } {
  const doc = new PdfContentBuilder();
  const companyName = proposal.clientName ?? proposal.prospectCompany ?? "Client";

  doc.spacer(30);
  doc.heading(companyName, 1, { center: true, color: NAVY, size: 22 });
  doc.paragraph(`Proposal ${proposal.quotationNumber ?? `#${proposal.proposalNumber}`}: ${proposal.title}`, {
    center: true,
    size: 13,
  });
  if (proposal.acceptedAt) {
    doc.paragraph(`Accepted ${formatDate(proposal.acceptedAt)}`, { center: true, size: 10 });
  }
  doc.spacer(20);

  // From/to address block - who this document is actually between,
  // previously missing from the signed copy entirely.
  doc.paragraph(`From: ${companyInfo.companyName}`, { size: 10 });
  if (companyInfo.address?.trim()) doc.paragraph(companyInfo.address, { size: 10 });
  doc.spacer(8);
  doc.paragraph(`To: ${companyName}`, { size: 10 });
  if (proposal.prospectAddress?.trim()) doc.paragraph(proposal.prospectAddress, { size: 10 });
  doc.spacer(16);

  if (proposal.intro?.trim()) {
    doc.paragraph(proposal.intro);
    doc.spacer(10);
  }

  const includedItems = proposal.lineItems.filter((i) => !i.isOptional || i.isSelected);
  const bodySections = proposal.sections.filter((s) => s.body?.trim() || s.kind === "pricing");

  for (const section of bodySections) {
    doc.heading(section.heading, 2);
    if (section.body?.trim()) doc.paragraph(section.body);

    if (section.kind === "pricing") {
      doc.spacer(4);
      doc.table(
        ["Item", "Qty", "Unit Price", "Total"],
        includedItems.map((i) => [
          i.detail ? `${i.description} - ${i.detail}` : i.description,
          i.quantity,
          formatMoney(i.unitPrice, proposal.currency),
          `${formatMoney(lineTotal(i), proposal.currency)}${PERIOD_SUFFIX[i.billingPeriod] ?? ""}`,
        ])
      );
      doc.spacer(8);
      const t = proposal.totals;
      if (t.oneOffSubtotal > 0) doc.paragraph(`One-time: ${formatMoney(t.oneOffSubtotal, proposal.currency)}`);
      if (t.annualSubtotal > 0) doc.paragraph(`Annually: ${formatMoney(t.annualSubtotal, proposal.currency)}/yr`);
      if (t.monthlySubtotal > 0) doc.paragraph(`Monthly: ${formatMoney(t.monthlySubtotal, proposal.currency)}/mo`);
      doc.paragraph(`HST (${(t.taxRate * 100).toFixed(0)}%): ${formatMoney(t.taxAmount, proposal.currency)}`);
      doc.paragraph(`Due at signing: ${formatMoney(t.firstInvoiceTotal, proposal.currency)}`, {
        color: NAVY,
        size: 12,
      });
    }
    doc.spacer(10);
  }

  if (proposal.closingNote?.trim()) {
    doc.paragraph(proposal.closingNote);
  }

  // Its own page, same reasoning as quarterly reviews' Screenshots page -
  // the acceptance record and signature read as a standalone certificate
  // of what was agreed to, not a continuation of the sales copy above it.
  doc.pagebreak();
  doc.heading("Acceptance record", 2);
  doc.paragraph(`Accepted by: ${proposal.acceptedByName ?? "-"}`);
  doc.paragraph(`Email: ${proposal.acceptedByEmail ?? "-"}`);
  doc.paragraph(`Date: ${formatDate(proposal.acceptedAt)}`);
  if (proposal.acceptedTotalAmount !== null) {
    doc.paragraph(`Total agreed, including HST: ${formatMoney(proposal.acceptedTotalAmount, proposal.currency)}`);
  }
  doc.spacer(14);
  if (signatureBuffer) {
    doc.paragraph("Signature:");
    doc.spacer(4);
    doc.image(signatureBuffer, null, "signature");
  }

  return doc.build();
}
