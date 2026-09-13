import { PdfContentBuilder } from "@/lib/pdf";
import { QUARTERLY_REVIEW_SECTIONS, QUARTERLY_STATUS_LABELS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";

export type QuarterlyReviewPdfItem = { itemKey: string; status: QuarterlyReviewItemStatus; comments: string | null };
export type QuarterlyReviewPdfImage = { id: string; buffer: Buffer; label: string | null; fileName: string };

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
}): { pdf: Buffer; embeddedImageIds: Set<string> } {
  const { clientName, reviewPeriod, summary, items, images } = params;
  const itemByKey = new Map(items.map((i) => [i.itemKey, i]));

  const doc = new PdfContentBuilder();
  doc.heading(`${clientName} — Quarterly Systems Review`, 1);
  doc.paragraph(reviewPeriod);
  doc.spacer(8);

  if (summary) {
    doc.heading("Summary", 2);
    doc.paragraph(summary);
    doc.spacer(4);
  }

  for (const section of QUARTERLY_REVIEW_SECTIONS) {
    doc.heading(section.label, 2);
    for (const item of section.items) {
      const row = itemByKey.get(item.key);
      const status = row?.status ?? "na";
      doc.item(item.label, QUARTERLY_STATUS_LABELS[status], row?.comments ?? null);
    }
    doc.spacer(6);
  }

  if (images.length > 0) {
    doc.spacer(4);
    doc.heading("Screenshots", 2);
    for (const image of images) {
      doc.image(image.buffer, image.label, image.id);
      doc.spacer(6);
    }
  }

  return doc.build();
}
