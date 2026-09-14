import { PdfContentBuilder } from "@/lib/pdf";
import { QUARTERLY_REVIEW_SECTIONS, QUARTERLY_STATUS_LABELS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";

export type QuarterlyReviewPdfItem = { itemKey: string; status: QuarterlyReviewItemStatus; comments: string | null };
export type QuarterlyReviewPdfImage = { id: string; buffer: Buffer; label: string | null; fileName: string };

// Matches the color coding used elsewhere in the app for these same
// statuses (badges, the checklist's own status tag) — RGB 0-1, for pdf.ts.
// Only ever applied to the status word itself, never to a label or
// comment someone typed — coloring every line of body text turned out to
// read as noisy rather than helpful.
const STATUS_COLORS: Record<QuarterlyReviewItemStatus, [number, number, number]> = {
  healthy: [0.086, 0.639, 0.29],
  attention: [0.851, 0.467, 0.024],
  urgent: [0.863, 0.149, 0.149],
  na: [0.58, 0.639, 0.722],
  recommended: [0.263, 0.22, 0.792],
};

const NAVY: [number, number, number] = [0.059, 0.09, 0.165];

const LABEL_BY_KEY = new Map(QUARTERLY_REVIEW_SECTIONS.flatMap((s) => s.items).map((i) => [i.key, i.label]));

/** Worst-first — the review's overall rating is just whichever of these is
 * present anywhere in the checklist, no separate field for staff to set. */
function computeOverallRating(items: QuarterlyReviewPdfItem[]): { label: string; color: [number, number, number] } {
  const statuses = new Set(items.map((i) => i.status));
  if (statuses.has("urgent")) return { label: "Needs Urgent Attention", color: STATUS_COLORS.urgent };
  if (statuses.has("attention")) return { label: "Needs Attention", color: STATUS_COLORS.attention };
  if (statuses.has("recommended")) return { label: "Healthy — Recommendations Available", color: STATUS_COLORS.recommended };
  return { label: "Healthy", color: STATUS_COLORS.healthy };
}

/** Plain-text default for the Action Items section — one line per item
 * that isn't Healthy/N/A. Used both as the PDF's fallback (when nobody's
 * generated/edited a custom version) and as the starting draft the
 * "Generate" button fills the editable field with. */
export function computeActionItemsText(items: QuarterlyReviewPdfItem[]): string {
  return items
    .filter((i) => i.status === "urgent" || i.status === "attention" || i.status === "recommended")
    .map((i) => {
      const label = LABEL_BY_KEY.get(i.itemKey) ?? i.itemKey;
      const statusLabel = QUARTERLY_STATUS_LABELS[i.status];
      return i.comments ? `${label} (${statusLabel}): ${i.comments}` : `${label} (${statusLabel})`;
    })
    .join("\n");
}

/** Plain-text default for the Changes Since Last Review section — one
 * line per item whose status actually moved since the client's previous
 * review. "->" rather than an arrow character: this hand-built PDF only
 * supports Latin-1, and an arrow glyph was rendering as "?". */
export function computeChangesSinceLastReviewText(
  items: QuarterlyReviewPdfItem[],
  previousItems: Map<string, QuarterlyReviewItemStatus> | null | undefined
): string {
  if (!previousItems) return "";
  return items
    .map((i) => ({ item: i, prevStatus: previousItems.get(i.itemKey) }))
    .filter((r): r is { item: QuarterlyReviewPdfItem; prevStatus: QuarterlyReviewItemStatus } =>
      Boolean(r.prevStatus && r.prevStatus !== r.item.status)
    )
    .map(({ item, prevStatus }) => {
      const label = LABEL_BY_KEY.get(item.itemKey) ?? item.itemKey;
      return `${label}: ${QUARTERLY_STATUS_LABELS[prevStatus]} -> ${QUARTERLY_STATUS_LABELS[item.status]}`;
    })
    .join("\n");
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
  /** Item statuses from the client's previous review, if any — only used
   * to compute a Changes Since Last Review fallback when actionItemsText/
   * changesSinceLastReviewText below aren't set. */
  previousItems?: Map<string, QuarterlyReviewItemStatus> | null;
  /** Editable overrides (quarterly_reviews.action_items_notes /
   * .changes_since_last_review_notes) — when set (non-empty), used
   * verbatim instead of the auto-computed list, so a staff edit actually
   * sticks. Falls back to computing from items/previousItems otherwise. */
  actionItemsText?: string | null;
  changesSinceLastReviewText?: string | null;
}): { pdf: Buffer; embeddedImageIds: Set<string> } {
  const { clientName, reviewPeriod, summary, items, images, previousItems, actionItemsText, changesSinceLastReviewText } =
    params;
  const itemByKey = new Map(items.map((i) => [i.itemKey, i]));

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

  const actionText = (actionItemsText ?? "").trim() || computeActionItemsText(items);
  if (actionText) {
    doc.heading("Action Items", 2);
    doc.paragraph(actionText);
    doc.spacer(10);
  }

  const changesText = (changesSinceLastReviewText ?? "").trim() || computeChangesSinceLastReviewText(items, previousItems);
  if (changesText) {
    doc.heading("Changes Since Last Review", 2);
    doc.paragraph(changesText);
    doc.spacer(10);
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
