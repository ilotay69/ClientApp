// On-demand AI read of a client's open Autotask tickets — self-contained
// Anthropic/OpenAI calls, mirroring mailbox-review.ts rather than
// generalizing the AI Insights (suggestions) schema in src/lib/ai/: that
// schema is bound to the `suggestions` table's kind/priority shape, and
// this returns something structurally different (one entry per ticket,
// not a flat list of suggestions) — small duplication, zero risk to the
// already-working suggestions path.
import type { AutotaskTicketNote } from "@/lib/autotask";
import type { ActiveAiSettings } from "@/lib/ai";

export type TicketForInsight = {
  id: number;
  ticket_number: string | null;
  title: string;
  description: string | null;
  resolution: string | null;
  status: string | null;
};

export type TicketInsight = {
  ticketId: number;
  keyPoint: string | null;
  pendingAction: string | null;
};

// Bounds prompt size for a ticket with a long note history — the most
// recent notes are what's actually relevant to "what's pending now."
const MAX_NOTES_PER_TICKET = 10;
const MAX_NOTE_CHARS = 500;

function buildTicketBlock(t: TicketForInsight, notes: AutotaskTicketNote[]) {
  const noteLines = notes
    .slice(0, MAX_NOTES_PER_TICKET)
    .map(
      (n) =>
        `  - [${n.createdAt.slice(0, 10)}${n.creatorName ? ` · ${n.creatorName}` : ""}] ${n.description.slice(0, MAX_NOTE_CHARS)}`
    )
    .join("\n");

  return `Ticket ${t.id} (#${t.ticket_number ?? t.id}) — "${t.title}" (status: ${t.status ?? "unknown"})
Description: ${t.description ?? "(none)"}
Resolution: ${t.resolution ?? "(none — still open)"}
Notes (most recent first):
${noteLines || "  (none logged)"}`;
}

const TOOL_NAME = "report_ticket_insights";
const TOOL_DESCRIPTION =
  "Report what's important in each ticket's notes and whether anything is still pending on the MSP's side.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticket_id: {
            type: "number",
            description: "The numeric ticket id given in the prompt (the number right after \"Ticket\", not the # number).",
          },
          key_point: {
            type: "string",
            description:
              "One short sentence on the single most important thing discussed in this ticket's notes — a decision, a blocker, a client complaint, a scope change. Omit this field entirely if nothing notable stands out beyond the obvious ticket title.",
          },
          pending_action: {
            type: "string",
            description:
              "One short sentence naming a concrete action still owed on the MSP's side — e.g. a quote not yet sent, a fix not yet confirmed with the client, a reply owed. Omit this field entirely if nothing is pending or the ticket reads as fully handled.",
          },
        },
        required: ["ticket_id"],
      },
    },
  },
  required: ["insights"],
} as const;

function buildPrompt(blocks: string[]) {
  return `You're reviewing open support tickets for an MSP client. For each ticket below, read its description, resolution, and notes (the actual back-and-forth between the technician and the client), and report only what's genuinely worth surfacing: the single most important thing discussed, and whether anything is still pending on the MSP's side.

Skip a ticket entirely (don't include it in the output at all) if there's nothing notable beyond the obvious — a routine, quiet, or fully-resolved ticket doesn't need an entry. Don't invent detail that isn't in the notes.

${blocks.join("\n\n")}

Use the ${TOOL_NAME} tool.`;
}

export async function generateTicketInsights(
  tickets: TicketForInsight[],
  notesByTicket: Map<number, AutotaskTicketNote[]>,
  settings: ActiveAiSettings
): Promise<TicketInsight[]> {
  if (tickets.length === 0) return [];

  const blocks = tickets.map((t) => buildTicketBlock(t, notesByTicket.get(t.id) ?? []));
  const prompt = buildPrompt(blocks);

  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  const raw = Array.isArray(parsed?.insights) ? parsed.insights : [];
  return raw
    .map(
      (r: { ticket_id?: unknown; key_point?: unknown; pending_action?: unknown }): TicketInsight => ({
        ticketId: Number(r.ticket_id),
        keyPoint: typeof r.key_point === "string" ? r.key_point : null,
        pendingAction: typeof r.pending_action === "string" ? r.pending_action : null,
      })
    )
    .filter((r: TicketInsight) => !Number.isNaN(r.ticketId) && (r.keyPoint || r.pendingAction));
}

async function callAnthropicTool(
  prompt: string,
  apiKey: string,
  model: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
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
