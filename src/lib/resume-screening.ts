import mammoth from "mammoth";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";
import type { ActiveAiSettings } from "@/lib/ai";

// Same tool-forcing convention as mailbox-review.ts/ticket-insights.ts (own
// TOOL_SCHEMA, own callAnthropicTool-style function, forced tool_choice) —
// the one real difference is `content` here is an array mixing document and
// text blocks instead of a plain string, since this is the first AI feature
// in this app that sends a file rather than text.
const TOOL_NAME = "report_resume_screening";
const TOOL_DESCRIPTION =
  "Screen each resume against the job posting and report structured results, one entry per resume.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          resume_number: {
            type: "integer",
            description: "The N in this resume's \"Resume #N\" label, exactly as given.",
          },
          candidate_name: {
            type: "string",
            description: "Full name, read from the resume's own content.",
          },
          candidate_email: {
            type: ["string", "null"],
            description: "The candidate's own email as printed on the resume — not email metadata.",
          },
          candidate_phone: {
            type: ["string", "null"],
            description: "Phone number as printed on the resume.",
          },
          verdict: { type: "string", enum: ["yes", "maybe", "no"] },
          comment: {
            type: "string",
            description: "1-3 sentences justifying the verdict against the job posting.",
          },
        },
        required: ["resume_number", "candidate_name", "verdict", "comment"],
      },
    },
  },
  required: ["results"],
} as const;

// Resumes per Anthropic call. Confirmed against Anthropic's own PDF-support
// docs: 600 pages/request (100 when the context window is under 1M tokens,
// which is every model this app uses), 32MB/request. A resume is typically
// 1-3 pages, so 5/call stays far clear of either ceiling while keeping one
// bad file's blast radius to a single small chunk rather than a whole batch.
const BATCH_SIZE = 5;

const PDF_MEDIA_TYPE = "application/pdf";
const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

type PendingResumeRow = {
  id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
};

/**
 * Builds the content block(s) for one resume, always preceded by its own
 * "Resume #N" text label — including for PDFs, even though a document block
 * could in principle stand alone. Confirmed against Anthropic's docs that
 * PDF support converts each page to an image internally before the model
 * ever sees it; relying on raw content-array position alone to recover which
 * logical resume a given piece of the response belongs to, across a chunk
 * mixing PDF documents and plain-text Word extracts, is exactly the kind of
 * assumption already burned twice on this feature's Graph-attachments code —
 * an explicit label removes the ambiguity outright rather than inferring it.
 */
async function buildResumeContentBlocks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  resume: PendingResumeRow,
  resumeNumber: number
): Promise<ContentBlock[]> {
  const { data, error } = await admin.storage.from("resumes").download(resume.storage_path);
  if (error || !data) {
    throw new Error(`Could not read ${resume.file_name}: ${error?.message ?? "no data returned"}`);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  const label = `Resume #${resumeNumber} (file: ${resume.file_name}):`;

  if (resume.content_type === PDF_MEDIA_TYPE) {
    return [
      { type: "text", text: label },
      {
        type: "document",
        source: { type: "base64", media_type: PDF_MEDIA_TYPE, data: buffer.toString("base64") },
      },
    ];
  }

  if (resume.content_type === DOCX_MEDIA_TYPE) {
    // mammoth reads .docx's actual XML structure (paragraphs/runs) rather
    // than reconstructing a visual layout the way PDF text extraction has
    // to — genuinely more reliable than the pdf-parse approach this app
    // already tried and abandoned once for a different feature. It has no
    // native equivalent in Claude's document API (that's PDF/image only),
    // so the extracted text goes in as a plain text block instead.
    const { value: text } = await mammoth.extractRawText({ buffer });
    return [
      {
        type: "text",
        text: `${label}\n${text.trim() || "(no extractable text found in this document)"}`,
      },
    ];
  }

  throw new Error(`Unsupported resume content type: ${resume.content_type}`);
}

function buildScreeningPrompt(
  posting: { title: string; description: string },
  count: number
): string {
  return `You are screening job applicant resumes for CG Technologies.

Job posting: ${posting.title}
${posting.description}

Above are ${count} resume(s), each preceded by its own "Resume #N (file: ...)" label —
some as an attached PDF document, others as extracted plain text. Treat both the same
way; the label is the only thing that tells you which resume_number each one is.

For EACH resume, read the candidate's full name, email, and phone number directly from
that resume's own content (never from surrounding context or another resume), and give
a fit verdict of "yes", "maybe", or "no" against the job posting above, with a short
1-3 sentence comment justifying it. Report exactly one entry per resume_number shown
above — don't skip any, and don't invent extra ones.`;
}

async function callAnthropicToolMultimodal(
  content: ContentBlock[],
  apiKey: string,
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  assertAsciiHeaderValue(apiKey, "AI provider API key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_SCHEMA }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const toolUse = (json.content ?? []).find(
    (block: { type: string }) => block.type === "tool_use"
  );
  return toolUse?.input ?? {};
}

export type ResumeScreeningResult = { screened: number; errored: number; remaining: number };

/**
 * Screens every resume with screened_at = null against the given job
 * posting. Anthropic-only — native document reading has no OpenAI
 * equivalent built here (an accepted v1 tradeoff). Chunks run sequentially,
 * not in parallel, so a bad chunk's failure doesn't clobber others already
 * in flight and progress already made is never lost; screened_at is set
 * once on first success, never auto-re-screened later.
 */
export async function screenPendingResumes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  posting: { id: string; title: string; description: string },
  settings: ActiveAiSettings
): Promise<ResumeScreeningResult> {
  if (settings.provider !== "anthropic") {
    throw new Error(
      "Resume screening requires Anthropic as the active AI provider (native document reading is Anthropic-only)."
    );
  }

  const { data: pending } = await admin
    .from("resumes")
    .select("id, storage_path, file_name, content_type")
    .is("screened_at", null)
    .order("received_at", { ascending: true })
    .limit(50);

  const rows: PendingResumeRow[] = pending ?? [];
  let screened = 0;
  let errored = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    try {
      const blocks = await Promise.all(
        chunk.map((r, idx) => buildResumeContentBlocks(admin, r, idx + 1))
      );
      const content: ContentBlock[] = [
        ...blocks.flat(),
        { type: "text", text: buildScreeningPrompt(posting, chunk.length) },
      ];

      const parsed = await callAnthropicToolMultimodal(content, settings.apiKey, settings.model);
      const byNumber = new Map<number, { candidate_name?: string; candidate_email?: string; candidate_phone?: string; verdict?: string; comment?: string }>(
        (parsed?.results ?? []).map((r: { resume_number: number }) => [r.resume_number, r])
      );

      for (let n = 0; n < chunk.length; n++) {
        const result = byNumber.get(n + 1);
        if (!result) {
          await admin
            .from("resumes")
            .update({ screening_error: "AI did not return a result for this resume." })
            .eq("id", chunk[n].id);
          errored += 1;
          continue;
        }
        await admin
          .from("resumes")
          .update({
            job_posting_id: posting.id,
            candidate_name: result.candidate_name ?? null,
            candidate_email: result.candidate_email ?? null,
            candidate_phone: result.candidate_phone ?? null,
            ai_verdict: result.verdict,
            ai_comment: result.comment,
            screened_at: new Date().toISOString(),
            screening_error: null,
          })
          .eq("id", chunk[n].id);
        screened += 1;
      }
    } catch (err) {
      // Whole-chunk failure (bad file, API error): mark every row in this
      // chunk with the error and move on. screened_at stays null, so a
      // later click retries them.
      const message = err instanceof Error ? err.message : "Screening failed.";
      for (const r of chunk) {
        await admin.from("resumes").update({ screening_error: message }).eq("id", r.id);
      }
      errored += chunk.length;
    }
  }

  return { screened, errored, remaining: Math.max(0, rows.length - screened - errored) };
}
