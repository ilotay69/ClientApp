// Minimal Anthropic Messages API client — plain fetch, no SDK dependency,
// mirroring the same approach used for Microsoft Graph.

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export type SuggestionKind = "follow_up" | "opportunity" | "stale_contact" | "qbr_prep" | "other";

export type GeneratedSuggestion = {
  kind: SuggestionKind;
  summary: string;
  detail: string;
};

const REPORT_TOOL = {
  name: "report_suggestions",
  description:
    "Report any suggestions worth a person's attention. Return an empty array if nothing genuinely new or actionable stands out.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["follow_up", "opportunity", "stale_contact", "qbr_prep", "other"],
            },
            summary: {
              type: "string",
              description: "One sentence, plain language, specific enough to act on.",
            },
            detail: {
              type: "string",
              description: "1-3 sentences of supporting context or reasoning.",
            },
          },
          required: ["kind", "summary", "detail"],
        },
      },
    },
    required: ["suggestions"],
  },
} as const;

export async function generateClientSuggestions(prompt: string): Promise<GeneratedSuggestion[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "report_suggestions" },
      messages: [{ role: "user", content: prompt }],
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
  if (!toolUse) return [];

  const suggestions = toolUse.input?.suggestions;
  return Array.isArray(suggestions) ? suggestions : [];
}
