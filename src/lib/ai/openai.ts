// Minimal OpenAI Chat Completions client — plain fetch, no SDK, mirroring
// the Anthropic client's shape so both are interchangeable behind
// generateClientSuggestions().

import {
  REPORT_SUGGESTIONS_TOOL_NAME,
  REPORT_SUGGESTIONS_DESCRIPTION,
  REPORT_SUGGESTIONS_SCHEMA,
  type GeneratedSuggestion,
} from "./schema";

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

export async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string
): Promise<GeneratedSuggestion[]> {
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
        {
          type: "function",
          function: {
            name: REPORT_SUGGESTIONS_TOOL_NAME,
            description: REPORT_SUGGESTIONS_DESCRIPTION,
            parameters: REPORT_SUGGESTIONS_SCHEMA,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: REPORT_SUGGESTIONS_TOOL_NAME },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    return [];
  }

  const suggestions = (parsed as { suggestions?: unknown })?.suggestions;
  return Array.isArray(suggestions) ? suggestions : [];
}
