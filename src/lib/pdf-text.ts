// pdf-parse's top-level index.js has a long-standing bug: on require, it
// checks `!module.parent` to decide whether it's being run standalone, and
// in that case tries to self-test against a fixture PDF shipped inside its
// own package. In a bundled/serverless context (Next.js on Railway) that
// check can misfire and crash the import outright. Importing the library's
// internal implementation directly skips that self-test path entirely — a
// workaround documented across pdf-parse's own issue tracker, not a guess.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Bounds how much of a large PDF's text ends up in a single database row —
// generous for a quote or a QBR deck, but not unbounded.
const MAX_EXTRACTED_CHARS = 100_000;

/** Returns null instead of throwing on any failure — a scanned/image-only
 * PDF, a corrupt file, or an unexpected library error should still let the
 * file itself get stored and attached; only the extracted-text convenience
 * is lost, not the upload. */
export async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const result = await pdfParse(buffer);
    const text = result.text?.trim();
    if (!text) return null;
    return text.length > MAX_EXTRACTED_CHARS ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
  } catch {
    return null;
  }
}
