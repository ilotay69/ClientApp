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

// Common status glyphs rendered as real Unicode codepoints — swapped for
// words so they read (and get matched by AI Insights) like plain text.
// Limitation: a checkmark/cross rendered from a custom icon font (common in
// generated PDF reports) often has no real Unicode codepoint behind it at
// all — pdf-parse can only extract what the PDF's font actually maps to, so
// those come through as nothing or as unrelated garbage characters. This
// table only catches the ones that extract as one of these known symbols.
const SYMBOL_WORDS: [RegExp, string][] = [
  [/[✓✔☑]/g, "[Yes]"], // ✓ ✔ ☑
  [/[✗✘☒✕]/g, "[No]"], // ✗ ✘ ☒ ✕
  [/[⚠️]?⚠/g, "[Warning]"], // ⚠
  [/[❗‼]/g, "[Important]"], // ❗ ‼
];

function normalizeStatusSymbols(text: string): string {
  return SYMBOL_WORDS.reduce((t, [pattern, word]) => t.replace(pattern, word), text);
}

// Quote PDFs are typically the priced scope followed by a boilerplate terms
// section — the latter is legal filler that only adds noise to AI Insights
// and the timeline entry. Heuristic: cut at the first heading that looks
// like a terms section, since that content runs to the end of the document
// in every quote template we've seen. Best-effort — a quote whose terms
// heading doesn't match one of these phrasings keeps its terms section.
const TERMS_HEADING = /\n\s*(?:terms\s*(?:and|&)\s*conditions|terms\s+of\s+(?:service|sale|use)|general\s+terms)\b/i;

function stripTermsAndConditions(text: string): string {
  const match = text.match(TERMS_HEADING);
  return match?.index ? text.slice(0, match.index).trim() : text;
}

/** Returns null instead of throwing on any failure — a scanned/image-only
 * PDF, a corrupt file, or an unexpected library error should still let the
 * file itself get stored and attached; only the extracted-text convenience
 * is lost, not the upload. Images are never part of the output — pdf-parse
 * only ever pulls the text layer, so there's nothing to strip out there. */
export async function extractPdfText(
  buffer: Buffer,
  { trimTermsAndConditions = false }: { trimTermsAndConditions?: boolean } = {}
): Promise<string | null> {
  try {
    const result = await pdfParse(buffer);
    let text = result.text?.trim();
    if (!text) return null;

    text = normalizeStatusSymbols(text);
    if (trimTermsAndConditions) text = stripTermsAndConditions(text);

    return text.length > MAX_EXTRACTED_CHARS ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
  } catch {
    return null;
  }
}
