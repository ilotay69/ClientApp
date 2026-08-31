// Provider-agnostic shape for the AI Insights suggestion tool/function —
// both Anthropic's tool-calling and OpenAI's function-calling accept the
// same JSON Schema, just nested differently in the request body.

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

export const REPORT_SUGGESTIONS_TOOL_NAME = "report_suggestions";

export const REPORT_SUGGESTIONS_DESCRIPTION =
  "Report any suggestions worth a person's attention. Return an empty array if nothing genuinely new or actionable stands out.";

export const REPORT_SUGGESTIONS_SCHEMA = {
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
} as const;
