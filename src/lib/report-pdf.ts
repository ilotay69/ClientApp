import { PdfContentBuilder } from "@/lib/pdf";
import type { ReportData, ReportCell } from "@/lib/reports";
import { getCgLogoBuffer } from "@/lib/brand-assets";

function cellText(value: ReportCell): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Turns any report's already-built {headers, rows} into a simple table
 * PDF - one function for every report in the catalog, rather than a
 * bespoke layout per report, since they all share the same tabular shape.
 * The table renderer (src/lib/pdf.ts) already paginates row-by-row as a
 * page fills, and already sanitizes text to Latin-1 (em dashes, curly
 * quotes, anything else) - nothing extra needed here for that.
 *
 * Mirrors the CSV download for the same key: the same full ReportData, no
 * truncation - this is not the capped preview shown on screen. */
export async function buildGenericReportPdf(title: string, data: ReportData): Promise<Buffer> {
  const doc = new PdfContentBuilder();
  const logoBuffer = await getCgLogoBuffer().catch(() => null);
  if (logoBuffer) {
    doc.image(logoBuffer, null, "cg-logo", { maxWidth: 120 });
    doc.spacer(10);
  }
  doc.heading(title, 1, { size: 18 });
  doc.paragraph(
    `${data.rows.length} row${data.rows.length === 1 ? "" : "s"} — generated ${new Date().toLocaleDateString("en-CA")}`,
    { size: 9 }
  );
  if (data.warnings && data.warnings.length > 0) {
    doc.paragraph(`Couldn't load: ${data.warnings.join("; ")}`, { size: 9 });
  }
  doc.spacer(10);
  doc.table(
    data.headers,
    data.rows.map((row) => row.map(cellText))
  );
  return doc.build().pdf;
}

/** A PDF download response — same Content-Disposition convention as
 * src/lib/csv.ts's csvResponse, so a report's PDF prompts a save exactly
 * like its CSV does. */
export function reportPdfResponse(filename: string, pdf: Buffer): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
