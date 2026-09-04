/** Minimal CSV writer — quotes a field only when it actually needs it
 * (contains a comma, quote, or newline), which keeps the common case
 * readable in a raw text view while still round-tripping correctly
 * through Excel/Sheets. No library — this is the entire spec that matters
 * for our own generated data (we're never receiving untrusted CSV). */
function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

/** A CSV download response — Content-Disposition prompts a save rather
 * than rendering inline, which is what every caller here wants. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
