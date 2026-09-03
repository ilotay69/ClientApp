// On-demand AI read of a live 90-day fetch of Autotask time entries,
// looking for two kinds of pattern a human wouldn't easily spot by
// scanning a list: the same kind of issue recurring for one client over
// and over (probably needs a permanent fix, not repeated patching), and
// similar work taking meaningfully different amounts of time across
// different clients (worth understanding why before assuming it's fine).
//
// Deliberately not persisted anywhere — fetched fresh from Autotask each
// time "Analyze patterns" is clicked, analyzed in memory, nothing written
// to this app's own database. An earlier version of this feature stored
// time entries in their own table to build up history; that was reverted
// (see migration 026) in favor of always reading live.
//
// Self-contained Anthropic/OpenAI calls, same reasoning as
// ticket-insights.ts/mailbox-review.ts: a different output shape than the
// suggestions schema, not worth generalizing that for.
import {
  fetchTimeEntriesInRange,
  resolveResourceNames,
  resolveTicketCompanyIds,
  type AutotaskCredentials,
} from "@/lib/autotask";
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
};

export type ClientPatternReport = {
  clientName: string;
  findings: TimeEntryFinding[];
};

/** Live fetch + resolution for the analysis below — no storage involved.
 * A time entry carries no client/company reference of its own, so each
 * one is attributed via its ticket's companyID (resolved directly from
 * Autotask, batched) mapped to a client through this app's own
 * clients.autotask_company_id (a read of already-synced client mappings,
 * not new persistence). An entry with no ticket or an unmapped company
 * still gets included, just with clientName null. */
export async function fetchTimeEntriesForAnalysis(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  sinceStr: string,
  untilStr: string
): Promise<TimeEntryForAnalysis[]> {
  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, sinceStr, untilStr);
  if (entries.length === 0) return [];

  const [resourceNames, ticketCompanyIds] = await Promise.all([
    resolveResourceNames(
      creds,
      zoneUrl,
      entries.map((e) => e.resourceID)
    ),
    resolveTicketCompanyIds(
      creds,
      zoneUrl,
      entries.map((e) => e.ticketID).filter((id): id is number => id != null)
    ),
  ]);

  const companyIds = [...new Set([...ticketCompanyIds.values()])];
  const { data: clients } = await admin
    .from("clients")
    .select("id, name, autotask_company_id")
    .in("autotask_company_id", companyIds.length > 0 ? companyIds : [-1]);
  const clientNameByCompanyId = new Map<number, string>(
    (clients ?? []).map(
      (c: { name: string; autotask_company_id: number }): [number, string] => [
        c.autotask_company_id,
        c.name,
      ]
    )
  );

  return entries.map((e) => {
    const companyId = e.ticketID != null ? ticketCompanyIds.get(e.ticketID) : undefined;
    return {
      clientName: companyId != null ? (clientNameByCompanyId.get(companyId) ?? null) : null,
      resourceName: resourceNames.get(e.resourceID) ?? `Resource ${e.resourceID}`,
      ticketId: e.ticketID,
      hoursWorked: e.hoursWorked,
      dateWorked: e.dateWorked.slice(0, 10),
      summaryNotes: e.summaryNotes,
    };
  });
}

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
  "Report, per client, any real recurring issues or inconsistent effort found in their logged time entries. Skip clients with nothing notable.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    clients: {
      type: "array",
      description:
        "Only clients that have at least one genuine finding — do not include a client here if nothing stood out for them.",
      items: {
        type: "object",
        properties: {
          client: {
            type: "string",
            description: "The client's name, exactly as given.",
          },
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["recurring_issue", "inconsistent_effort", "other"],
                  description:
                    "recurring_issue: the same kind of problem keeps coming up for this client across multiple entries/days — suggests it needs a permanent fix rather than repeated patching. inconsistent_effort: work that reads as the same kind of task took meaningfully different amounts of time for this client compared to similar work elsewhere — worth understanding why, not necessarily a problem. other: any other real pattern worth a look, specific to this client.",
                },
                title: {
                  type: "string",
                  description: "One short, specific sentence naming the pattern.",
                },
                detail: {
                  type: "string",
                  description:
                    "1-3 sentences of supporting evidence — which entries/dates this is based on, and why it's worth attention.",
                },
              },
              required: ["type", "title", "detail"],
            },
          },
        },
        required: ["client", "findings"],
      },
    },
  },
  required: ["clients"],
} as const;

function buildPrompt(entries: TimeEntryForAnalysis[]): string {
  return `You're reviewing logged time entries (work an MSP's technicians did, by client), client by client, looking for two specific kinds of pattern — not a general summary of the work:

1. recurring_issue — the same kind of problem shows up repeatedly for ONE client across multiple entries/days (read the notes for what the work actually was, not just that time was logged). That's a signal the underlying problem was never actually fixed, just patched again each time.
2. inconsistent_effort — work that reads as the same kind of task took meaningfully different amounts of time for a client compared to similar work logged elsewhere. That's worth flagging so someone can look at why, not an accusation that something's wrong.

Only report a real pattern backed by what the notes actually say — don't invent detail, and don't report something just because a client has a lot of entries. Only include a client in your output if they have at least one genuine finding — skip every client whose logged work looks normal. It's completely fine to return zero clients if nothing genuinely stands out anywhere.

Time entries (most recent ${Math.min(entries.length, MAX_ENTRIES)} of ${entries.length}):
${buildEntryList(entries)}

Use the ${TOOL_NAME} tool.`;
}

export async function analyzeTimeEntryPatterns(
  entries: TimeEntryForAnalysis[],
  settings: ActiveAiSettings
): Promise<ClientPatternReport[]> {
  if (entries.length === 0) return [];

  const prompt = buildPrompt(entries);
  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  const raw = Array.isArray(parsed?.clients) ? parsed.clients : [];
  return raw
    .map(
      (c: { client?: unknown; findings?: unknown }): ClientPatternReport => ({
        clientName: typeof c.client === "string" ? c.client : "",
        findings: Array.isArray(c.findings)
          ? c.findings
              .map(
                (f: { type?: unknown; title?: unknown; detail?: unknown }): TimeEntryFinding => ({
                  type:
                    f.type === "recurring_issue" || f.type === "inconsistent_effort"
                      ? f.type
                      : "other",
                  title: typeof f.title === "string" ? f.title : "",
                  detail: typeof f.detail === "string" ? f.detail : "",
                })
              )
              .filter((f: TimeEntryFinding) => f.title)
          : [],
      })
    )
    .filter((c: ClientPatternReport) => c.clientName && c.findings.length > 0);
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
