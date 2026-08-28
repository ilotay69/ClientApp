// Minimal Anthropic Messages API client — plain fetch, no SDK dependency,
// mirroring the same approach used for Microsoft Graph.

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export type SuggestionKind =
  | "follow_up"
  | "quote_follow_up"
  | "urgent_alert"
  | "new_project"
  | "opportunity"
  | "stale_contact"
  | "review_prep"
  | "other";
export type SuggestionPriority = "normal" | "high";

export type GeneratedSuggestion = {
  kind: SuggestionKind;
  summary: string;
  detail: string;
  priority: SuggestionPriority;
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
              enum: [
                "follow_up",
                "quote_follow_up",
                "urgent_alert",
                "new_project",
                "opportunity",
                "stale_contact",
                "review_prep",
                "other",
              ],
              description:
                "quote_follow_up: a customer asked for pricing and we haven't answered, or we sent pricing and they've gone quiet (no dollar amounts needed). urgent_alert: something time-sensitive or important in the mailbox (an outage, a security/compliance notice, unusually urgent language). new_project: an email suggests a new project or engagement that isn't already tracked. follow_up: any other client follow-up that looks unhandled. stale_contact: no proactive contact in a while relative to their email activity. review_prep: worth preparing for the next monthly visit or quarterly review. opportunity: a possible upsell/new-service signal. other: anything else worth a look.",
            },
            summary: {
              type: "string",
              description: "One sentence, plain language, specific enough to act on.",
            },
            detail: {
              type: "string",
              description: "1-3 sentences of supporting context or reasoning.",
            },
            priority: {
              type: "string",
              enum: ["normal", "high"],
              description:
                "high only for something time-sensitive or clearly important (e.g. an outage, an angry customer, a security issue, a quote gone cold past a reasonable window). Default normal.",
            },
          },
          required: ["kind", "summary", "detail", "priority"],
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
