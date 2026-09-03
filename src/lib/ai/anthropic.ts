// Minimal Anthropic Messages API client — plain fetch, no SDK dependency,
// mirroring the same approach used for Microsoft Graph.

import {
  REPORT_SUGGESTIONS_TOOL_NAME,
  REPORT_SUGGESTIONS_DESCRIPTION,
  REPORT_SUGGESTIONS_SCHEMA,
  type GeneratedSuggestion,
} from "./schema";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string
): Promise<GeneratedSuggestion[]> {
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
      tools: [
        {
          name: REPORT_SUGGESTIONS_TOOL_NAME,
          description: REPORT_SUGGESTIONS_DESCRIPTION,
          input_schema: REPORT_SUGGESTIONS_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: REPORT_SUGGESTIONS_TOOL_NAME },
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
