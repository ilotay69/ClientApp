// On-demand AI read of stored time entries (autotask_time_entries) looking
// for two kinds of patterns a human wouldn't easily spot by scanning a
// list: the same kind of issue recurring for one client over and over
// (probably needs a permanent fix, not repeated patching), and similar
// work taking meaningfully different amounts of time across different
// clients (worth understanding why before assuming it's fine). This is
// the piece that decides whether persisting time entries is worth
// keeping at all — if it doesn't surface anything real, there's nothing
// else this data is for yet.
//
// Self-contained Anthropic/OpenAI calls, same reasoning as
// ticket-insights.ts/mailbox-review.ts: a different output shape than the
// suggestions schema, not worth generalizing that for.
import type { ActiveAiSettings } from "@/lib/ai";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";

export type TimeEntryForAnalysis = {
  clientName: string | null;
  resourceName: string;
  ticketId: number | null;
  hoursWorked: number;
  dateWorked: string;
  summaryNotes: string | null;
};

export type TimeEntryFinding = {
  type: "recurring_issue" | "inconsistent_effort" | "other";
  title: string;
  detail: string;
  clients: string[];
};

const MAX_ENTRIES = 400;
const MAX_NOTE_CHARS = 300;

function buildEntryList(entries: TimeEntryForAnalysis[]): string {
  return entries
    .slice(0, MAX_ENTRIES)
    .map((e) => {
      const notes = e.summaryNotes
        ? e.summaryNotes.slice(0, MAX_NOTE_CHARS) + (e.summaryNotes.length > MAX_NOTE_CHARS ? "…" : "")
        : "(no notes)";
      return `- [${e.dateWorked}] ${e.clientName ?? "Unattributed"} · ${e.resourceName} · ${e.hoursWorked}h${e.ticketId ? ` · Ticket #${e.ticketId}` : ""}: ${notes}`;
    })
    .join("\n");
}

const TOOL_NAME = "report_time_entry_patterns";
const TOOL_DESCRIPTION =
  "Report recurring issues and inconsistent effort found across a set of logged time entries.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["recurring_issue", "inconsistent_effort", "other"],
            description:
              "recurring_issue: the same kind of problem keeps coming up for one client across multiple entries/days — suggests it needs a permanent fix rather than repeated patching. inconsistent_effort: similar-sounding work took meaningfully different amounts of time across different clients — worth understanding why, not necessarily a problem. other: any other real pattern worth a look.",
          },
          title: {
            type: "string",
            description: "One short, specific sentence naming the pattern.",
          },
          detail: {
            type: "string",
            description:
              "1-3 sentences of supporting evidence — which entries/dates/clients this is based on, and why it's worth attention.",
          },
          clients: {
            type: "array",
            items: { type: "string" },
            description: "Client names this finding involves.",
          },
        },
        required: ["type", "title", "detail", "clients"],
      },
    },
  },
  required: ["findings"],
} as const;

function buildPrompt(entries: TimeEntryForAnalysis[]): string {
  return `You're reviewing logged time entries (work an MSP's technicians did, by client) looking for two specific kinds of pattern — not a general summary of the work:

1. recurring_issue — the same kind of problem shows up repeatedly for ONE client across multiple entries/days (read the notes for what the work actually was, not just that time was logged). That's a signal the underlying problem was never actually fixed, just patched again each time.
2. inconsistent_effort — work that reads as the same kind of task took meaningfully different amounts of time across DIFFERENT clients. That's worth flagging so someone can look at why, not an accusation that something's wrong.

Only report a real pattern backed by what the notes actually say — don't invent detail, and don't report something just because a client has a lot of entries. It's completely fine to return zero findings if nothing genuinely stands out.

Time entries (most recent ${Math.min(entries.length, MAX_ENTRIES)} of ${entries.length}):
${buildEntryList(entries)}

Use the ${TOOL_NAME} tool.`;
}

export async function analyzeTimeEntryPatterns(
  entries: TimeEntryForAnalysis[],
  settings: ActiveAiSettings
): Promise<TimeEntryFinding[]> {
  if (entries.length === 0) return [];

  const prompt = buildPrompt(entries);
  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  const raw = Array.isArray(parsed?.findings) ? parsed.findings : [];
  return raw
    .map(
      (f: { type?: unknown; title?: unknown; detail?: unknown; clients?: unknown }): TimeEntryFinding => ({
        type:
          f.type === "recurring_issue" || f.type === "inconsistent_effort" ? f.type : "other",
        title: typeof f.title === "string" ? f.title : "",
        detail: typeof f.detail === "string" ? f.detail : "",
        clients: Array.isArray(f.clients) ? f.clients.filter((c): c is string => typeof c === "string") : [],
      })
    )
    .filter((f: TimeEntryFinding) => f.title);
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
      max_tokens: 2048,
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
