import { readFile } from "fs/promises";
import path from "path";

// CG Technologies' own logo, pulled from cgtechnologies.com (their real
// mark, not a stand-in) — see public/cg-logo.svg / cg-mark.svg for the
// vector originals used everywhere web rendering can use an <img> tag
// directly. This data-URL form exists only for next/og's ImageResponse
// (favicon/app-icon generation, PDF rendering elsewhere), which needs the
// image bytes available synchronously rather than as a fetchable URL.
export async function getCgMarkDataUrl(): Promise<string> {
  const filePath = path.join(process.cwd(), "public", "cg-mark.png");
  const buf = await readFile(filePath);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export async function getCgLogoDataUrl(): Promise<string> {
  const filePath = path.join(process.cwd(), "public", "cg-logo.png");
  const buf = await readFile(filePath);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Raw buffer form for src/lib/pdf.ts's PdfContentBuilder.image(), which
// embeds a PNG's bytes directly into the PDF rather than taking a URL.
export async function getCgLogoBuffer(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "public", "cg-logo.png"));
}

export async function getCgMarkBuffer(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "public", "cg-mark.png"));
}
