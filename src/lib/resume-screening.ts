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
            type: ["string", "null"],
            description: "Full name, read from whatever content is provided — null only if genuinely not stated anywhere for this applicant.",
          },
          candidate_email: {
            type: ["string", "null"],
            description: "The candidate's own email as stated for them — not email metadata.",
          },
          candidate_phone: {
            type: ["string", "null"],
            description: "Phone number as stated for them.",
          },
          verdict: { type: "string", enum: ["yes", "maybe", "no"] },
          // A dedicated field, not a prose instruction telling the model to
          // "add a summary on top" — a free-text instruction competing
          // against the two schema-forced fields below gets ignored far
          // more often than a schema field the model is required to fill
          // in on its own. Goes first in ai_comment, ahead of the two
          // detailed sections (see screenPendingResumes).
          overall_summary: {
            type: "string",
            description:
              "A punchy 1-2 sentence overall read on this candidate, combining both technical fit and customer-relationship fit into one quick-scan verdict — the kind of line a hiring manager would want before reading the detail below. Not a restatement of the yes/maybe/no verdict alone.",
          },
          // Two separate fields, not one combined comment field, deliberately:
          // a schema field the model must fill in on its own is a much more
          // reliable way to get a real, on-topic assessment of each dimension
          // than asking it to self-format one string into two labeled
          // sections — that's the kind of formatting instruction models
          // follow inconsistently. Combined into ai_comment with headers at
          // write time (see screenPendingResumes) rather than storing them as
          // separate columns, so nothing downstream (the UI, the DB schema)
          // has to change.
          technical_ability: {
            type: "string",
            description:
              "1-2 sentences on the candidate's technical/IT skill fit against the job posting specifically. If there's genuinely not enough information to judge this, say so plainly rather than guessing.",
          },
          customer_relationships: {
            type: "string",
            description:
              "1-2 sentences on the candidate's apparent ability to build and maintain positive customer relationships — communication, professionalism, customer-service instincts, teamwork with non-technical people. Look for direct customer-facing experience (help desk, retail, hospitality, account management, etc.), not just technical roles. If there's genuinely not enough information to judge this, say so plainly rather than guessing.",
          },
          big_firm_experience: {
            type: ["boolean", "null"],
            description:
              "true if the candidate's MOST RECENT employer looks like a company with more than 500 employees (a large or multinational organization, multiple sites/regions, a large-scale IT environment) — false if it looks like 500 or fewer, null if genuinely can't be told from what's provided.",
          },
          years_experience: {
            type: ["integer", "null"],
            description:
              "Total years of relevant IT/technical work experience, estimated from the work history's dates (not counting education alone). Round to the nearest whole year. Null if genuinely can't be determined.",
          },
          currently_working: {
            type: ["boolean", "null"],
            description:
              "true if the candidate's most recent job looks still-current (no end date, or explicitly \"present\"/\"current\"), false if their most recent job clearly ended, null if genuinely can't be told.",
          },
          months_since_worked: {
            type: ["integer", "null"],
            description:
              "Only when currently_working is false: roughly how many months between their most recent job's stated end date and today's date (given in the prompt above) — calculate this, don't leave it null just because it takes arithmetic. Null only if currently_working is true, or no end date is stated at all.",
          },
          in_gta: {
            type: ["boolean", "null"],
            description:
              "true if the candidate is located in the Greater Toronto Area (Toronto, Mississauga, Brampton, Markham, Vaughan, Richmond Hill, Oakville, Scarborough, Etobicoke, North York, and similar GTA municipalities), false if a city is stated and it's clearly outside the GTA. If the candidate's own address isn't given, judge by their most recent job's location instead. Null only if no city is mentioned anywhere at all — don't guess.",
          },
          m365_technologies: {
            type: ["string", "null"],
            description:
              "A short comma-separated list of specific Microsoft cloud/365 technologies the resume shows HANDS-ON ADMIN/CONFIGURATION evidence for — not just end-user app use. Just keywords, e.g. \"Intune, Azure AD, Exchange Admin, SharePoint Admin\" — no sentences, no explanation. Only include ones actually evidenced (Intune, Azure AD/Entra ID, Exchange Admin Center, SharePoint Admin, Teams Admin, Microsoft 365 Admin Center, Power Platform, Azure, Conditional Access, Autopilot, and similar are the kinds of things to look for). Null if none are evidenced at all.",
          },
        },
        required: [
          "resume_number",
          "verdict",
          "overall_summary",
          "technical_ability",
          "customer_relationships",
          "big_firm_experience",
          "years_experience",
          "currently_working",
          "months_since_worked",
          "in_gta",
          "m365_technologies",
        ],
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

// Per-invocation cap for the "whatever's pending" path (no explicit
// resumeIds) — kept equal to BATCH_SIZE, i.e. exactly one Anthropic call per
// screenPendingResumes() call, not several sequential ones. A single Server
// Action request that fires off many chunks in a row (the old cap was 50,
// up to 10 sequential Anthropic calls) risks outliving Railway's own
// reverse-proxy request timeout, which surfaces to the user as a generic
// browser-level "This page couldn't load" — not a caught, displayable error
// at all. The caller (ScreenPendingResumesButton) loops this call instead,
// so many-pending-resumes screening still runs to completion, just as a
// sequence of short requests rather than one long one.
const PENDING_SCREEN_LIMIT = BATCH_SIZE;

const PDF_MEDIA_TYPE = "application/pdf";
const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

type PendingResumeRow = {
  id: string;
  storage_path: string | null;
  file_name: string | null;
  content_type: string | null;
  pasted_resume_text: string | null;
  email_body_text: string | null;
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
 *
 * A row has two possible resume-content sources by the time it reaches here
 * (a stored file or staff-pasted text — screenPendingResumes only selects
 * rows that have one of the two), plus an optional email_body_text that's
 * always included when present alongside either — a job-board notification's
 * own body (screening-question answers, etc.) is useful supporting context
 * once there's an actual resume to screen.
 */
async function buildResumeContentBlocks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  resume: PendingResumeRow,
  resumeNumber: number
): Promise<ContentBlock[]> {
  // A local const, not a derived boolean, so TypeScript actually narrows
  // storagePath to `string` (not `string | null`) inside the block below —
  // checking a separately-stored `hasFile` boolean wouldn't narrow
  // resume.storage_path itself.
  const storagePath = resume.storage_path;
  const label = storagePath
    ? `Resume #${resumeNumber} (file: ${resume.file_name}):`
    : `Resume #${resumeNumber} (pasted resume text):`;

  const blocks: ContentBlock[] = [{ type: "text", text: label }];

  if (resume.email_body_text) {
    blocks.push({
      type: "text",
      text: `Application notification email content:\n${resume.email_body_text}`,
    });
  }

  if (storagePath) {
    const { data, error } = await admin.storage.from("resumes").download(storagePath);
    if (error || !data) {
      throw new Error(`Could not read ${resume.file_name}: ${error?.message ?? "no data returned"}`);
    }
    const buffer = Buffer.from(await data.arrayBuffer());

    if (resume.content_type === PDF_MEDIA_TYPE) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: PDF_MEDIA_TYPE, data: buffer.toString("base64") },
      });
    } else if (resume.content_type === DOCX_MEDIA_TYPE) {
      // mammoth reads .docx's actual XML structure (paragraphs/runs) rather
      // than reconstructing a visual layout the way PDF text extraction has
      // to — genuinely more reliable than the pdf-parse approach this app
      // already tried and abandoned once for a different feature. It has no
      // native equivalent in Claude's document API (that's PDF/image only),
      // so the extracted text goes in as a plain text block instead.
      const { value: text } = await mammoth.extractRawText({ buffer });
      blocks.push({
        type: "text",
        text: text.trim() || "(no extractable text found in this document)",
      });
    } else {
      throw new Error(`Unsupported resume content type: ${resume.content_type}`);
    }
  } else if (resume.pasted_resume_text) {
    blocks.push({ type: "text", text: resume.pasted_resume_text });
  } else {
    // The pending query in screenPendingResumes only selects rows that have
    // a file or pasted text — reaching here means something upstream is
    // broken, not a normal "nothing to screen yet" state.
    throw new Error("This row has no resume file or pasted text to screen.");
  }

  return blocks;
}

function buildScreeningPrompt(
  posting: { title: string; description: string; additional_instructions: string | null },
  count: number
): string {
  const extraInstructions = posting.additional_instructions?.trim()
    ? `\nAdditional instructions from the hiring team:\n${posting.additional_instructions.trim()}\n`
    : "";

  const today = new Date().toISOString().slice(0, 10);

  return `You are screening job applicants for CG Technologies. Today's date is ${today} —
use this to calculate months_since_worked and years_experience from any dates given in a
resume, since you otherwise have no way to know how much time has passed since a stated
end date. Resumes state dates in all kinds of formats (e.g. "2025.Nov", "Nov 2025",
"11/2025", "November 2025") — use your best judgement to interpret whatever format is
given rather than skipping the calculation because it isn't in a standard format.

Job posting: ${posting.title}
${posting.description}
${extraInstructions}
Above are ${count} applicant(s), each preceded by its own "Resume #N (...)" label. Some
carry an attached PDF resume, some carry extracted text from a Word resume or a
staff-pasted resume, and some carry only an application notification email's own
content with no resume file yet — treat all of these the same way; the label is the
only thing that tells you which resume_number each one is. A notification email's own
content (e.g. answers to screening questions like availability, transportation, work
authorization) is real signal even without a resume file — use it.

CG Technologies is an MSP (managed service provider) — its technicians work directly
with client staff every day, not just with machines. We are hiring for BOTH technical
ability AND the ability to build good customer relationships — neither one alone is
enough. A candidate who's clearly technically strong but shows no evidence of
communication skills, professionalism, or customer-facing experience is NOT an
automatic "yes"; weigh both dimensions together when you decide the verdict, the same
way a hiring manager here actually would.

For EACH applicant, read the candidate's full name, email, and phone number directly
from whatever content is provided for them (never from surrounding context or another
applicant), leaving a field null if it genuinely isn't stated anywhere for them. Give a
fit verdict of "yes", "maybe", or "no" against the job posting above, weighing technical
ability and customer-relationship ability together as described. Write overall_summary
as the quick top-line take a hiring manager would want to read first — 1-2 sentences,
not a repeat of the yes/maybe/no verdict alone. Also report big_firm_experience — true
if the candidate's MOST RECENT employer looks like a company with more than 500
employees, false if 500 or fewer — years_experience (their total relevant work
experience in years, estimated from the work history's dates), currently_working (does
their most recent job look still-current, e.g. no end date or "present") plus, only
when currently_working is false, months_since_worked (roughly how many months since
that job ended), in_gta (is the candidate located in the Greater Toronto Area —
judge by their own stated address, or failing that, their most recent job's location),
and m365_technologies (a short keyword list — not sentences — of specific Microsoft
cloud technologies with HANDS-ON ADMIN/CONFIGURATION evidence, e.g. "Intune, Azure AD,
Exchange Admin"; not just end-user app use) — leave any of these null if it genuinely can't be told from what's provided, don't
guess. Note explicitly in technical_ability or customer_relationships
if your verdict is based only on notification content with no resume yet. Report
exactly one entry per resume_number shown above — don't skip any, and don't invent
extra ones.`;
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
      // Was 2048 — fine back when this was just verdict + one comment
      // field, but the schema has grown to 11 required fields per resume
      // since (several of them free text), and a batch covers 5 resumes
      // at once. "AI did not return a result for this resume" showing up
      // across many resumes at once (not just one occasionally) is the
      // signature of the response getting cut off mid-batch, not the
      // model genuinely skipping one — this is deliberately generous
      // headroom, not a precisely-tuned number.
      max_tokens: 8192,
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

const CONTACT_TOOL_NAME = "report_candidate_contact_info";
const CONTACT_TOOL_SCHEMA = {
  type: "object",
  properties: {
    candidate_name: { type: ["string", "null"], description: "Full name, read directly from the text — null if genuinely not stated." },
    candidate_email: { type: ["string", "null"], description: "The candidate's own email address as stated — null if not present." },
    candidate_phone: { type: ["string", "null"], description: "Phone number as stated — null if not present." },
  },
  required: ["candidate_name", "candidate_email", "candidate_phone"],
} as const;

export type CandidateContactInfo = {
  candidate_name: string | null;
  candidate_email: string | null;
  candidate_phone: string | null;
};

const EMPTY_CONTACT_INFO: CandidateContactInfo = {
  candidate_name: null,
  candidate_email: null,
  candidate_phone: null,
};

/**
 * Reads whatever contact info it can off a plain block of pasted resume
 * text — deliberately separate from screenPendingResumes' own extraction:
 * that one needs a job posting and always screens for fit too, which
 * "staff just pasted a resume and left the name/email/phone fields blank"
 * shouldn't have to wait on. Best-effort: any failure (no AI provider
 * configured, a request error) returns all-null rather than throwing, so a
 * manual add always succeeds — worst case, staff just fill the fields in
 * themselves.
 */
export async function extractCandidateContactInfo(
  pastedText: string,
  settings: ActiveAiSettings
): Promise<CandidateContactInfo> {
  if (settings.provider !== "anthropic" || !pastedText.trim()) return EMPTY_CONTACT_INFO;

  try {
    assertAsciiHeaderValue(settings.apiKey, "AI provider API key");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 512,
        tools: [
          {
            name: CONTACT_TOOL_NAME,
            description: "Report the candidate's contact info read from the given resume text.",
            input_schema: CONTACT_TOOL_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: CONTACT_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: `Read the candidate's name, email, and phone number from this resume text:\n\n${pastedText}`,
          },
        ],
      }),
    });
    if (!res.ok) return EMPTY_CONTACT_INFO;

    const json = await res.json();
    const toolUse = (json.content ?? []).find((block: { type: string }) => block.type === "tool_use");
    const result = toolUse?.input ?? {};
    return {
      candidate_name: result.candidate_name ?? null,
      candidate_email: result.candidate_email ?? null,
      candidate_phone: result.candidate_phone ?? null,
    };
  } catch {
    return EMPTY_CONTACT_INFO;
  }
}

export type ResumeScreeningResult = { screened: number; errored: number; remaining: number };

/**
 * Screens resumes against the given job posting. Anthropic-only — native
 * document reading has no OpenAI equivalent built here (an accepted v1
 * tradeoff). Chunks run sequentially, not in parallel, so a bad chunk's
 * failure doesn't clobber others already in flight and progress already
 * made is never lost.
 *
 * By default only screens resumes with screened_at = null (never screened
 * before) — `screened_at` is set once on first success and not
 * auto-re-screened later. Pass `resumeIds` (the "Screen selected" button) to
 * re-screen exactly that set instead, regardless of prior screening state —
 * useful right after the posting's own instructions change, or after the
 * screening prompt itself changes, so a chosen set of rows gets judged
 * against the current criteria rather than staying stuck with an old
 * verdict. `resumeIds` and the screened_at filter are mutually exclusive:
 * an explicit selection is always (re-)screened in full, uncapped by the
 * 50-per-call limit that only applies to the "whatever's pending" case.
 */
export async function screenPendingResumes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  posting: { id: string; title: string; description: string; additional_instructions: string | null },
  settings: ActiveAiSettings,
  options?: { resumeIds?: string[] }
): Promise<ResumeScreeningResult> {
  if (settings.provider !== "anthropic") {
    throw new Error(
      "Resume screening requires Anthropic as the active AI provider (native document reading is Anthropic-only)."
    );
  }

  let resumeQuery = admin
    .from("resumes")
    .select("id, storage_path, file_name, content_type, pasted_resume_text, email_body_text")
    // A row with neither a file nor pasted text is notification-only
    // (nothing but an application email) — don't screen it off that alone;
    // wait until staff actually adds a resume, whichever way.
    .or("storage_path.not.is.null,pasted_resume_text.not.is.null")
    .order("received_at", { ascending: true });
  if (options?.resumeIds) {
    resumeQuery = resumeQuery.in("id", options.resumeIds);
  } else {
    resumeQuery = resumeQuery.is("screened_at", null).limit(PENDING_SCREEN_LIMIT);
  }
  const { data: pending } = await resumeQuery;

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
      // The model's tool call isn't guaranteed to match TOOL_SCHEMA byte for
      // byte — a single-resume chunk (e.g. "Screen selected" on one row) has
      // occasionally come back with `results` as a bare object instead of a
      // one-element array. Treat a non-array, non-null `results` as that one
      // result rather than crashing every row in the chunk on `.map`.
      type ScreeningResult = {
        resume_number: number;
        candidate_name?: string;
        candidate_email?: string;
        candidate_phone?: string;
        verdict?: string;
        overall_summary?: string;
        technical_ability?: string;
        customer_relationships?: string;
        big_firm_experience?: boolean | null;
        years_experience?: number | null;
        currently_working?: boolean | null;
        months_since_worked?: number | null;
        in_gta?: boolean | null;
        m365_technologies?: string | null;
      };
      const rawResults = parsed?.results;
      const resultsArray: ScreeningResult[] = Array.isArray(rawResults)
        ? rawResults
        : rawResults && typeof rawResults === "object"
          ? [rawResults as ScreeningResult]
          : [];
      const byNumber = new Map<number, ScreeningResult>(
        resultsArray.map((r) => [r.resume_number, r])
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
        // Combined into one string with clear section headers here, rather
        // than storing the schema fields as separate columns — keeps
        // ai_comment, the UI, and the DB schema exactly as they were; only
        // the shape of what generates the text changed. overall_summary goes
        // first with no header, as the quick-scan line above the detail.
        const comment = [
          result.overall_summary ? `Overview: ${result.overall_summary}` : null,
          result.technical_ability ? `Technical ability: ${result.technical_ability}` : null,
          result.customer_relationships
            ? `Building customer relationships: ${result.customer_relationships}`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        // Captures the write's own error rather than assuming success —
        // update() doesn't throw on a DB-level failure (a missing column
        // from a migration that hasn't run yet, say), so without this a
        // failed write was silently counted as "screened" while nothing
        // actually got saved.
        const { error: updateError } = await admin
          .from("resumes")
          .update({
            job_posting_id: posting.id,
            candidate_name: result.candidate_name ?? null,
            candidate_email: result.candidate_email ?? null,
            candidate_phone: result.candidate_phone ?? null,
            ai_verdict: result.verdict,
            ai_comment: comment || null,
            big_firm_experience: result.big_firm_experience ?? null,
            years_experience: result.years_experience ?? null,
            currently_working: result.currently_working ?? null,
            months_since_worked: result.months_since_worked ?? null,
            in_gta: result.in_gta ?? null,
            m365_technologies: result.m365_technologies ?? null,
            screened_at: new Date().toISOString(),
            screening_error: null,
          })
          .eq("id", chunk[n].id);
        if (updateError) {
          console.error("screenPendingResumes: row update failed", updateError);
          await admin
            .from("resumes")
            .update({ screening_error: updateError.message })
            .eq("id", chunk[n].id);
          errored += 1;
          continue;
        }
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

  // For the "whatever's pending" path, rows.length is capped at
  // PENDING_SCREEN_LIMIT, so "rows.length - screened - errored" (the old
  // computation) was never a real remaining-work count — every row in the
  // batch always ends up screened or errored, so it was always ~0 even with
  // hundreds still waiting. Re-query the true pending count instead, so the
  // caller (a looping button) knows whether to fire another request. Not
  // meaningful for an explicit resumeIds selection, which isn't looped.
  let remaining = 0;
  if (!options?.resumeIds) {
    const { count } = await admin
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .or("storage_path.not.is.null,pasted_resume_text.not.is.null")
      .is("screened_at", null);
    remaining = count ?? 0;
  }

  return { screened, errored, remaining };
}
