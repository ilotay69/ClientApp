// On-demand AI draft of a quarterly review's client-facing summary — self-
// contained Anthropic/OpenAI calls, same per-feature pattern as
// backup-analysis.ts/interview-analysis.ts. Unlike those two (internal,
// staff-facing reads), this prompt writes for the CLIENT reading their own
// review — plain language, reassuring where things are healthy, clear
// about what needs attention.
import type { ActiveAiSettings } from "@/lib/ai";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";
import { QUARTERLY_REVIEW_SECTIONS, QUARTERLY_STATUS_LABELS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";

export type QuarterlyReviewItemForSummary = {
  itemKey: string;
  status: QuarterlyReviewItemStatus;
  comments: string | null;
};

function buildItemsBlock(items: QuarterlyReviewItemForSummary[]): string {
  const byKey = new Map(items.map((i) => [i.itemKey, i]));
  return QUARTERLY_REVIEW_SECTIONS.map((section) => {
    const lines = section.items
      .map((item) => {
        const row = byKey.get(item.key);
        const status = row?.status ?? "na";
        if (status === "na") return null; // Not applicable — nothing to say.
        return `  - ${item.label}: ${QUARTERLY_STATUS_LABELS[status]}${row?.comments ? ` — ${row.comments}` : ""}`;
      })
      .filter((line): line is string => line !== null);
    if (lines.length === 0) return null;
    return `${section.label}:\n${lines.join("\n")}`;
  })
    .filter((block): block is string => block !== null)
    .join("\n\n");
}

const TOOL_NAME = "report_review_summary";
const TOOL_DESCRIPTION = "Write a short client-facing summary of a quarterly IT systems review.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "A short (3-5 sentence) summary written directly for the CLIENT reading their own quarterly systems review — plain, non-technical language where possible. Reassure them about what's healthy, and clearly but calmly name anything that needs attention or urgent attention. Base this only on the actual checklist results given below — don't invent detail, and don't just list every item back verbatim.",
    },
  },
  required: ["summary"],
} as const;

function buildPrompt(clientName: string, reviewPeriod: string, itemsBlock: string): string {
  return `Write a short client-facing summary for a quarterly IT systems review, to be read directly by the client.

Client: ${clientName}
Review period: ${reviewPeriod}

Checklist results (items marked Not Applicable are omitted below):

${itemsBlock || "(nothing recorded yet)"}

Use the ${TOOL_NAME} tool.`;
}

export async function generateQuarterlyReviewSummary(
  clientName: string,
  reviewPeriod: string,
  items: QuarterlyReviewItemForSummary[],
  settings: ActiveAiSettings
): Promise<string | null> {
  const prompt = buildPrompt(clientName, reviewPeriod, buildItemsBlock(items));

  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  return typeof parsed?.summary === "string" ? parsed.summary : null;
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
      max_tokens: 768,
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
