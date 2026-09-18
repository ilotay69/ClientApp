import { PdfContentBuilder } from "@/lib/pdf";
import type { ContractUsageRow } from "@/lib/contract-hours";
import { getCgLogoBuffer } from "@/lib/brand-assets";

const NAVY: [number, number, number] = [0.059, 0.09, 0.165];
const RED: [number, number, number] = [0.863, 0.149, 0.149];
const AMBER: [number, number, number] = [0.851, 0.467, 0.024];
const GREEN: [number, number, number] = [0.086, 0.639, 0.29];

function usageColor(percentUsed: number): [number, number, number] {
  if (percentUsed >= 90) return RED;
  if (percentUsed >= 75) return AMBER;
  return GREEN;
}

function hrs(n: number): string {
  return n.toFixed(2);
}

/** Client-facing PDF version of the Contract Usage report — same data
 * fetchContractUsageForCompany already computes (purchased/used/remaining
 * straight from Autotask's own block fields, entries for detail), laid
 * out as a standalone document instead of an internal lookup table, for
 * emailing to the client directly. */
export async function buildContractUsagePdf(clientName: string, rows: ContractUsageRow[]): Promise<Buffer> {
  const doc = new PdfContentBuilder();
  const logoBuffer = await getCgLogoBuffer().catch(() => null);

  doc.spacer(logoBuffer ? 20 : 40);
  if (logoBuffer) {
    doc.image(logoBuffer, null, "cg-logo", { maxWidth: 130, center: true });
    doc.spacer(14);
  }
  doc.heading(clientName, 1, { center: true, color: NAVY, size: 24 });
  doc.paragraph("Contract Usage Report", { center: true, color: NAVY, size: 14 });
  doc.paragraph(
    new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }),
    { center: true, size: 11 }
  );
  doc.spacer(24);

  if (rows.length === 0) {
    doc.paragraph("No currently-active contract blocks for this client.");
    return doc.build().pdf;
  }

  for (const row of rows) {
    doc.heading(row.contractName, 2);
    doc.paragraph(`Block period: ${row.startDate} to ${row.endDate}`);
    doc.spacer(4);
    doc.paragraph(
      `Purchased: ${hrs(row.purchased)} hrs   Used: ${hrs(row.used)} hrs   Remaining: ${hrs(row.remaining)} hrs (${row.percentUsed.toFixed(0)}% used)`,
      { color: usageColor(row.percentUsed) }
    );
    doc.spacer(12);

    if (row.entries.length > 0) {
      doc.heading("Time Entries", 2, { size: 13 });
      for (const e of row.entries) {
        const label = `${e.dateWorked.slice(0, 10)} - ${e.resourceName ?? "Unknown"}`;
        const status = `${hrs(e.hoursToBill)} hrs`;
        const reference = e.ticketId ? `Ticket #${e.ticketId}` : e.taskId ? `Task #${e.taskId}` : null;
        const comments = [reference, e.summaryNotes].filter(Boolean).join(" - ") || null;
        doc.item(label, status, comments);
      }
    }
    doc.spacer(16);
  }

  return doc.build().pdf;
}
