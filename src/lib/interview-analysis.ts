// On-demand AI read of a candidate's accumulated interview notes — reports a
// short rolling summary of how the interview process is going, regenerated
// every time a note is saved. Self-contained Anthropic/OpenAI calls, same
// per-feature pattern as ticket-insights.ts/mailbox-review.ts rather than
// generalizing the AI Insights (suggestions) schema in src/lib/ai/.
import type { ActiveAiSettings } from "@/lib/ai";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type InterviewNoteForAnalysis = {
  noteText: string;
  createdAt: string;
  authorName: string | null;
};

// Bounds prompt size for a candidate with a long note history.
const MAX_NOTES = 30;
const MAX_NOTE_CHARS = 1000;

function buildNotesBlock(notes: InterviewNoteForAnalysis[]) {
  return notes
    .slice(-MAX_NOTES)
    .map(
      (n) =>
        `[${n.createdAt.slice(0, 10)}${n.authorName ? ` · ${n.authorName}` : ""}] ${n.noteText.slice(0, MAX_NOTE_CHARS)}`
    )
    .join("\n\n");
}

const TOOL_NAME = "report_interview_analysis";
const TOOL_DESCRIPTION =
  "Report a short rolling analysis of how a candidate's interview process is going, based on staff's own notes.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "string",
      description:
        "A concise 2-4 sentence read on how the interview process is going for this candidate overall, based on ALL the notes together — recurring strengths or concerns, and where things seem to be headed. Don't just restate the most recent note. Don't invent detail that isn't in the notes.",
    },
  },
  required: ["analysis"],
} as const;

function buildPrompt(candidateName: string, jobTitle: string | null, notesBlock: string) {
  return `You're helping a hiring team track how a candidate's interview process is going.

Candidate: ${candidateName}${jobTitle ? `\nRole: ${jobTitle}` : ""}

Staff's own interview notes, oldest first:

${notesBlock}

Use the ${TOOL_NAME} tool.`;
}

export async function generateInterviewAnalysis(
  candidateName: string,
  jobTitle: string | null,
  notes: InterviewNoteForAnalysis[],
  settings: ActiveAiSettings
): Promise<string | null> {
  if (notes.length === 0) return null;

  const prompt = buildPrompt(candidateName, jobTitle, buildNotesBlock(notes));

  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  return typeof parsed?.analysis === "string" ? parsed.analysis : null;
}

async function callAnthropicTool(
  prompt: string,
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
      max_tokens: 1024,
      tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_SCHEMA }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const toolUse = (json.content ?? []).find((block: { type: string }) => block.type === "tool_use");
  return toolUse?.input ?? {};
}

async function callOpenAiTool(
  prompt: string,
  apiKey: string,
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  assertAsciiHeaderValue(apiKey, "AI provider API key");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      tools: [
        { type: "function", function: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: TOOL_SCHEMA } },
      ],
      tool_choice: { type: "function", function: { name: TOOL_NAME } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return {};

  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return {};
  }
}
