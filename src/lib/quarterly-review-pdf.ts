import { PdfContentBuilder } from "@/lib/pdf";
import {
  ALL_TEMPLATE_SECTIONS,
  QUARTERLY_STATUS_LABELS,
  getQuarterlyReviewSections,
  type QuarterlyReviewItemStatus,
  type QuarterlyReviewTemplateKey,
  type QuarterlyReviewSection,
} from "@/lib/quarterly-review-sections";
import { buildDeviceInsights, buildDeviceAgeBreakdown, deviceAgeDays, type DeviceInsightInput } from "@/lib/device-insights";
import { getCgLogoBuffer } from "@/lib/brand-assets";

export type QuarterlyReviewPdfItem = { itemKey: string; status: QuarterlyReviewItemStatus; comments: string | null };
export type QuarterlyReviewPdfImage = { id: string; buffer: Buffer; label: string | null; fileName: string };
/** Same shape client-ninjaone-devices.tsx queries — the fields
 * buildDeviceInsights/buildDeviceAgeBreakdown need (DeviceInsightInput),
 * plus an id to key rows, plus manufacturer/model/cpu/ram purely for the
 * printed Device Inventory line below (not used in any insight scoring). */
export type QuarterlyReviewPdfDevice = DeviceInsightInput & {
  id: number;
  manufacturer: string | null;
  model: string | null;
  cpu_model: string | null;
  ram_bytes: number | null;
};
export type QuarterlyReviewPdfLicense = { skuPartNumber: string; consumedUnits: number; enabledUnits: number };

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

const LABEL_BY_KEY = new Map(ALL_TEMPLATE_SECTIONS.flatMap((s) => s.items).map((i) => [i.key, i.label]));

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

/** Same rounding/units as the Devices tab's own formatBytes, so a figure
 * printed here always matches what's shown on the client's own record. */
function formatBytes(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  const gb = bytes / 1024 ** 3;
  return gb >= 1000 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(0)} GB`;
}

function diskUsageLabel(d: Pick<QuarterlyReviewPdfDevice, "disk_total_bytes" | "disk_free_bytes">): string | null {
  if (!d.disk_total_bytes) return null;
  const total = formatBytes(d.disk_total_bytes);
  if (!total) return null;
  if (d.disk_free_bytes === null) return total;
  const usedBytes = d.disk_total_bytes - d.disk_free_bytes;
  const usedPercent = Math.round((usedBytes / d.disk_total_bytes) * 100);
  return `${formatBytes(usedBytes)} used of ${total} (${usedPercent}%)`;
}

/** Shared by buildDeviceHealthPdf below — a standalone PDF, generated the
 * moment a tech checks "Device Health" under a review's "Also include in
 * PDF" list (see quarterly-review-data.ts's generateQuarterlyReviewSectionPdf),
 * rather than merged into the main review PDF, so it can be reviewed and
 * attached to the client email on its own. */
function appendDeviceHealthSection(doc: PdfContentBuilder, devices: QuarterlyReviewPdfDevice[]) {
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
    const hasUnknown = ageBreakdown.some((e) => e.unknownCount > 0);
    const headers = ["Category", ...ageBreakdown[0].buckets.map((b) => b.label), ...(hasUnknown ? ["Unknown"] : [])];
    const rows = ageBreakdown.map((entry) => [
      entry.label,
      ...entry.buckets.map((b) => (b.count > 0 ? b.count : "–")),
      ...(hasUnknown ? [entry.unknownCount > 0 ? entry.unknownCount : "–"] : []),
    ]);
    doc.table(headers, rows);
    doc.paragraph(
      "Age is based on the manufacturer's warranty ship date when NinjaOne has it; otherwise the date the device was first enrolled.",
      { size: 8, color: [0.58, 0.639, 0.722] }
    );
    doc.spacer(10);
  }

  doc.heading("Device Inventory", 2, { size: 13 });
  for (const d of [...devices].sort((a, b) => a.system_name.localeCompare(b.system_name))) {
    const modelLabel = [d.manufacturer, d.model].filter(Boolean).join(" ") || null;
    const detail =
      [d.os_name, deviceAgeLabel(d), modelLabel, d.cpu_model, formatBytes(d.ram_bytes) && `${formatBytes(d.ram_bytes)} RAM`, diskUsageLabel(d)]
        .filter(Boolean)
        .join(" · ") || null;
    doc.item(
      d.system_name,
      d.is_offline ? "Offline" : "Online",
      detail,
      d.is_offline ? STATUS_COLORS.urgent : STATUS_COLORS.healthy
    );
  }
}

/** Shared by buildM365LicensesPdf below — same standalone-PDF-per-section
 * posture as Device Health above. */
function appendM365LicensesSection(doc: PdfContentBuilder, licenses: QuarterlyReviewPdfLicense[]) {
  doc.heading("365 Licenses", 2);
  for (const l of [...licenses].sort((a, b) => a.skuPartNumber.localeCompare(b.skuPartNumber))) {
    const fullyUsed = l.consumedUnits >= l.enabledUnits;
    doc.item(
      l.skuPartNumber,
      `${l.consumedUnits}/${l.enabledUnits} used`,
      null,
      fullyUsed ? STATUS_COLORS.attention : STATUS_COLORS.healthy
    );
  }
}

/** One small standalone PDF per optional section (see
 * QUARTERLY_REVIEW_EXTRA_SECTIONS) — generated right when a tech checks it
 * on the review page, previewable there, and attached alongside (not
 * merged into) the main review PDF when the review is sent. Title page
 * mirrors the main review PDF's exactly (client name, subtitle, a service-
 * matched icon, "Prepared by CG Technologies") so it doesn't read as a
 * bare, unattributed report on its own once it's out of context in an
 * email attachment. */
export async function buildDeviceHealthPdf(clientName: string, devices: QuarterlyReviewPdfDevice[]): Promise<Buffer> {
  const doc = new PdfContentBuilder();
  const logoBuffer = await getCgLogoBuffer().catch(() => null);
  doc.spacer(logoBuffer ? 30 : 60);
  if (logoBuffer) {
    doc.image(logoBuffer, null, "cg-logo", { maxWidth: 140, center: true });
    doc.spacer(16);
  }
  doc.heading(clientName, 1, { center: true, color: NAVY, size: 26 });
  doc.paragraph("Device Health", { center: true, color: NAVY, size: 15 });
  doc.spacer(24);
  doc.icon("devices");
  doc.spacer(24);
  doc.paragraph("Prepared by CG Technologies", { center: true, size: 11 });
  doc.pagebreak();
  appendDeviceHealthSection(doc, devices);
  return doc.build().pdf;
}

export async function buildM365LicensesPdf(clientName: string, licenses: QuarterlyReviewPdfLicense[]): Promise<Buffer> {
  const doc = new PdfContentBuilder();
  const logoBuffer = await getCgLogoBuffer().catch(() => null);
  doc.spacer(logoBuffer ? 30 : 60);
  if (logoBuffer) {
    doc.image(logoBuffer, null, "cg-logo", { maxWidth: 140, center: true });
    doc.spacer(16);
  }
  doc.heading(clientName, 1, { center: true, color: NAVY, size: 26 });
  doc.paragraph("365 Licenses", { center: true, color: NAVY, size: 15 });
  doc.spacer(24);
  doc.icon("cloud");
  doc.spacer(24);
  doc.paragraph("Prepared by CG Technologies", { center: true, size: 11 });
  doc.pagebreak();
  appendM365LicensesSection(doc, licenses);
  return doc.build().pdf;
}

/** Builds the full review as a standalone PDF — client-facing detail moves
 * here instead of living in the email body. Screenshots that can't be
 * decoded (only PNG/JPEG are supported — GIF/WEBP are rare in practice
 * since these come from clipboard-pasted screenshots) are simply left out
 * of embeddedImageIds so the caller can attach those originals to the
 * email directly instead of silently dropping them. */
export async function buildQuarterlyReviewPdf(params: {
  clientName: string;
  reviewPeriod: string;
  /** Which checklist this review was built from — picks the right section
   * list/order for the printed checklist below (see
   * getQuarterlyReviewSections). Defaults to Standard for an old review
   * predating the template column. */
  template?: QuarterlyReviewTemplateKey | string | null;
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
}): Promise<{ pdf: Buffer; embeddedImageIds: Set<string> }> {
  const {
    clientName,
    reviewPeriod,
    template,
    summary,
    items,
    images,
    previousItems,
    actionItemsText,
    changesSinceLastReviewText,
  } = params;
  const sections: QuarterlyReviewSection[] = getQuarterlyReviewSections(template);
  const itemByKey = new Map(items.map((i) => [i.itemKey, i]));

  const doc = new PdfContentBuilder();
  const logoBuffer = await getCgLogoBuffer().catch(() => null);

  // Title page — bigger, colorful type plus a small vector "systems check"
  // graphic, and now CG's own logo (previously this hand-built PDF writer
  // had no source image to embed one from).
  doc.spacer(logoBuffer ? 30 : 60);
  if (logoBuffer) {
    doc.image(logoBuffer, null, "cg-logo", { maxWidth: 140, center: true });
    doc.spacer(16);
  }
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

  for (const section of sections) {
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
