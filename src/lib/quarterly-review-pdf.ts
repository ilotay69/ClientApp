import { PdfContentBuilder } from "@/lib/pdf";
import { QUARTERLY_REVIEW_SECTIONS, QUARTERLY_STATUS_LABELS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";
import { buildDeviceInsights, buildDeviceAgeBreakdown, deviceAgeDays, type DeviceInsightInput } from "@/lib/device-insights";

export type QuarterlyReviewPdfItem = { itemKey: string; status: QuarterlyReviewItemStatus; comments: string | null };
export type QuarterlyReviewPdfImage = { id: string; buffer: Buffer; label: string | null; fileName: string };
/** Same shape client-ninjaone-devices.tsx queries — just the fields
 * buildDeviceInsights/buildDeviceAgeBreakdown need plus an id to key rows. */
export type QuarterlyReviewPdfDevice = DeviceInsightInput & { id: number };

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

/** "2.3y old" — same age math as the Devices tab (deviceAgeDays), just
 * rendered as a short inline label for a PDF item row's comment. */
function deviceAgeLabel(d: Pick<DeviceInsightInput, "manufacturer_fulfillment_date" | "device_created_at">): string | null {
  const days = deviceAgeDays(d);
  return days !== null ? `${(days / 365).toFixed(1)}y old` : null;
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
  /** NinjaOne devices synced for this client — omitted (or empty) entirely
   * skips the Device Health section, for a client with no NinjaOne mapping
   * or nothing synced yet. Not editable like the fields above: this is
   * computed fresh from current device data every time, same as the
   * checklist's own item statuses aren't hand-typed prose. */
  devices?: QuarterlyReviewPdfDevice[];
}): { pdf: Buffer; embeddedImageIds: Set<string> } {
  const {
    clientName,
    reviewPeriod,
    summary,
    items,
    images,
    previousItems,
    actionItemsText,
    changesSinceLastReviewText,
    devices = [],
  } = params;
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

  if (devices.length > 0) {
    // Its own page, same reasoning as Screenshots below — supplementary
    // automated data, kept visually distinct from the staff-assessed
    // checklist above rather than just continuing on from it.
    doc.pagebreak();
    doc.heading("Device Health", 2);

    const onlineCount = devices.filter((d) => d.is_offline === false).length;
    const offlineCount = devices.filter((d) => d.is_offline === true).length;
    doc.paragraph(
      `${devices.length} device${devices.length === 1 ? "" : "s"} — ${onlineCount} online, ${offlineCount} offline.`
    );
    doc.spacer(8);

    const insights = buildDeviceInsights(devices);
    if (insights.length > 0) {
      doc.heading("Needs Attention", 2, { size: 13 });
      for (const insight of insights) {
        doc.item(
          insight.title,
          insight.severity === "high" ? "High" : "Medium",
          insight.detail,
          insight.severity === "high" ? STATUS_COLORS.urgent : STATUS_COLORS.attention
        );
      }
      doc.spacer(10);
    }

    const ageBreakdown = buildDeviceAgeBreakdown(devices);
    if (ageBreakdown.length > 0) {
      doc.heading("Device Age", 2, { size: 13 });
      for (const entry of ageBreakdown) {
        const bucketText = entry.buckets.map((b) => `${b.label}: ${b.count}`).join(", ");
        const unknownText = entry.unknownCount > 0 ? `, Unknown: ${entry.unknownCount}` : "";
        doc.paragraph(`${entry.label} — ${bucketText}${unknownText}`);
      }
      doc.spacer(10);
    }

    doc.heading("Device Inventory", 2, { size: 13 });
    for (const d of [...devices].sort((a, b) => a.system_name.localeCompare(b.system_name))) {
      const detail = [d.os_name, deviceAgeLabel(d)].filter(Boolean).join(" - ") || null;
      doc.item(
        d.system_name,
        d.is_offline ? "Offline" : "Online",
        detail,
        d.is_offline ? STATUS_COLORS.urgent : STATUS_COLORS.healthy
      );
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
