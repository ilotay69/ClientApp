// On-demand AI read of the last 2 weeks of daily backup reports — self-
// contained Anthropic/OpenAI calls, same per-feature pattern as
// ticket-insights.ts/interview-analysis.ts rather than generalizing the AI
// Insights (suggestions) schema in src/lib/ai/.
import type { ActiveAiSettings } from "@/lib/ai";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";
import { BACKUP_REPORT_SECTIONS } from "@/lib/backup-report-sections";

export type BackupReportForAnalysis = {
  reportDate: string;
  items: { sectionKey: string; status: string; notes: string | null }[];
};

const sectionLabel = (key: string) => BACKUP_REPORT_SECTIONS.find((s) => s.key === key)?.label ?? key;

function buildReportBlock(report: BackupReportForAnalysis): string {
  const lines = report.items
    .filter((i) => i.status !== "pending")
    .map((i) => `  - ${sectionLabel(i.sectionKey)}: ${i.status.toUpperCase()}${i.notes ? ` — ${i.notes}` : ""}`)
    .join("\n");
  return `${report.reportDate}:\n${lines || "  (nothing recorded)"}`;
}

const TOOL_NAME = "report_backup_analysis";
const TOOL_DESCRIPTION = "Report a summary of how backups have been going over the last 2 weeks and what needs to be done.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "string",
      description:
        "A concise summary (short paragraphs or bullet points as plain text) of how backups have been going across the last 2 weeks of daily checklists: recurring or unresolved issues (the same system flagged 'issue' on multiple days), anything that got fixed, and a clear list of what still needs action. Base this ONLY on what the notes actually say — don't invent detail, and don't just repeat every day's line items back verbatim.",
    },
  },
  required: ["analysis"],
} as const;

function buildPrompt(reports: BackupReportForAnalysis[]): string {
  const blocks = reports.map(buildReportBlock).join("\n\n");
  return `You're reviewing an MSP's daily backup-check reports for the last 2 weeks (oldest first). Each day's checklist covers PRTG, NinjaOne, client domain/SSL expiry, Shadow Protect, ESA Dropbox, Veeam, CrashPlan, Slide, Datto 365/BCDR/Endpoints, and any low-priority issues — each item's status is OK, ISSUE, or N/A, with staff's own notes.

${blocks}

Read all of this together and report a rolling-summary analysis: what's recurring/unresolved, what's improved, and what concretely needs to be done next.

Use the ${TOOL_NAME} tool.`;
}

export async function generateBackupAnalysis(
  reports: BackupReportForAnalysis[],
  settings: ActiveAiSettings
): Promise<string | null> {
  if (reports.length === 0) return null;

  const prompt = buildPrompt(reports);

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
      max_tokens: 1536,
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
