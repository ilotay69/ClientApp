import { PdfContentBuilder } from "@/lib/pdf";
import { QUARTERLY_REVIEW_SECTIONS, QUARTERLY_STATUS_LABELS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";

export type QuarterlyReviewPdfItem = { itemKey: string; status: QuarterlyReviewItemStatus; comments: string | null };
export type QuarterlyReviewPdfImage = { id: string; buffer: Buffer; label: string | null; fileName: string };

// Matches the color coding used elsewhere in the app for these same
// statuses (badges, the old client-email table) — RGB 0-1, for pdf.ts.
const STATUS_COLORS: Record<QuarterlyReviewItemStatus, [number, number, number]> = {
  healthy: [0.086, 0.639, 0.29],
  attention: [0.851, 0.467, 0.024],
  urgent: [0.863, 0.149, 0.149],
  na: [0.58, 0.639, 0.722],
  recommended: [0.263, 0.22, 0.792],
};

const NAVY: [number, number, number] = [0.059, 0.09, 0.165];

/** Worst-first — the review's overall rating is just whichever of these is
 * present anywhere in the checklist, no separate field for staff to set. */
function computeOverallRating(items: QuarterlyReviewPdfItem[]): { label: string; color: [number, number, number] } {
  const statuses = new Set(items.map((i) => i.status));
  if (statuses.has("urgent")) return { label: "Needs Urgent Attention", color: STATUS_COLORS.urgent };
  if (statuses.has("attention")) return { label: "Needs Attention", color: STATUS_COLORS.attention };
  if (statuses.has("recommended")) return { label: "Healthy — Recommendations Available", color: STATUS_COLORS.recommended };
  return { label: "Healthy", color: STATUS_COLORS.healthy };
}

/** Builds the full review as a standalone PDF — client-facing detail moves
 * here instead of living in the email body. Screenshots that can't be
 * decoded (only PNG/JPEG are supported — GIF/WEBP are rare in practice
 * since these come from clipboard-pasted screenshots) are simply left out
 * of embeddedImageIds so the caller can attach those originals to the
 * email directly instead of silently dropping them. */
export function buildQuarterlyReviewPdf(params: {
  clientName: string;
  reviewPeriod: string;
  summary: string | null;
  items: QuarterlyReviewPdfItem[];
  images: QuarterlyReviewPdfImage[];
  /** Item statuses from the client's previous review, if any — used only
   * to compute the "Changes Since Last Review" section (status
   * transitions). Never the old comments themselves, so this stays a
   * plain "what changed" note rather than carrying over unrelated
   * internal detail from the prior round. */
  previousItems?: Map<string, QuarterlyReviewItemStatus> | null;
}): { pdf: Buffer; embeddedImageIds: Set<string> } {
  const { clientName, reviewPeriod, summary, items, images, previousItems } = params;
  const itemByKey = new Map(items.map((i) => [i.itemKey, i]));
  const labelByKey = new Map(QUARTERLY_REVIEW_SECTIONS.flatMap((s) => s.items).map((i) => [i.key, i.label]));

  const doc = new PdfContentBuilder();

  // Title page — bigger, colorful type plus a small vector "systems check"
  // graphic in place of the original template's own image, since this
  // hand-built PDF writer has no source image to embed one from.
  doc.spacer(60);
  doc.heading(clientName, 1, { center: true, color: NAVY, size: 26 });
  doc.paragraph("Quarterly Systems Review", { center: true, color: NAVY, size: 15 });
  doc.paragraph(reviewPeriod, { center: true, color: STATUS_COLORS.recommended, size: 13 });
  doc.spacer(24);
  doc.icon();
  doc.spacer(24);
  doc.paragraph("Prepared by CG Technologies", { center: true, size: 11 });
  doc.pagebreak();

  const rating = computeOverallRating(items);
  doc.heading(`Overall Status: ${rating.label}`, 2, { color: rating.color });
  doc.spacer(8);

  if (summary) {
    doc.heading("Summary", 2);
    doc.paragraph(summary);
    doc.spacer(10);
  }

  // Action items — auto-derived from anything not Healthy/N/A, so there's
  // no separate field for staff to fill in beyond the checklist itself.
  const actionItems = items.filter((i) => i.status === "urgent" || i.status === "attention" || i.status === "recommended");
  if (actionItems.length > 0) {
    doc.heading("Action Items", 2);
    for (const i of actionItems) {
      const label = labelByKey.get(i.itemKey) ?? i.itemKey;
      doc.item(label, QUARTERLY_STATUS_LABELS[i.status], i.comments, STATUS_COLORS[i.status]);
    }
    doc.spacer(10);
  }

  // Changes since last review — only for clients with a prior review, and
  // only items whose status actually moved (either direction).
  if (previousItems) {
    const changes = items
      .map((i) => ({ item: i, prevStatus: previousItems.get(i.itemKey) }))
      .filter((r): r is { item: QuarterlyReviewPdfItem; prevStatus: QuarterlyReviewItemStatus } =>
        Boolean(r.prevStatus && r.prevStatus !== r.item.status)
      );
    if (changes.length > 0) {
      doc.heading("Changes Since Last Review", 2);
      for (const { item, prevStatus } of changes) {
        const label = labelByKey.get(item.itemKey) ?? item.itemKey;
        doc.paragraph(`${label}: ${QUARTERLY_STATUS_LABELS[prevStatus]} → ${QUARTERLY_STATUS_LABELS[item.status]}`, {
          color: STATUS_COLORS[item.status],
        });
      }
      doc.spacer(10);
    }
  }

  for (const section of QUARTERLY_REVIEW_SECTIONS) {
    doc.heading(section.label, 2);
    for (const item of section.items) {
      const row = itemByKey.get(item.key);
      const status = row?.status ?? "na";
      doc.item(item.label, QUARTERLY_STATUS_LABELS[status], row?.comments ?? null, STATUS_COLORS[status]);
    }
    doc.spacer(14);
  }

  if (images.length > 0) {
    // Its own page, same as the title page — keeps it visually distinct
    // from the last checklist section rather than starting wherever the
    // previous section happened to end.
    doc.pagebreak();
    doc.heading("Screenshots", 2);
    for (const image of images) {
      doc.image(image.buffer, image.label, image.id);
      doc.spacer(6);
    }
  }

  return doc.build();
}
