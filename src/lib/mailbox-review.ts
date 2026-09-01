import {
  findFolderIdByDisplayName,
  fetchMessagesInFolder,
  type MailboxSnapshotMessage,
} from "@/lib/microsoft-graph";
import { getValidAccessToken } from "@/lib/mail-sync";
import { getActiveAiSettings } from "@/lib/ai/settings";
import type { ActiveAiSettings } from "@/lib/ai";
import type { MailConnection } from "@/lib/types";

const LOOKBACK_DAYS = 30;
// Scope is intentionally narrow: Inbox, a custom "Active Inbox" triage
// folder (if the user has one), and Sent Items — everything else
// (subfolders, Deleted Items, Junk, etc.) is ignored entirely.
const ACTIVE_INBOX_FOLDER_NAME = "Active Inbox";
// Bounds the AI prompt size — the most-overdue threads (the ones that
// matter most) go in first; anything past this cap only gets the plain
// deterministic sentence, not an AI-written one.
const MAX_DIGEST_THREADS = 40;

type DigestThread = {
  subject: string;
  contact: string;
  direction: "awaiting_you" | "awaiting_them";
  daysPending: number;
  snippet: string;
};

export type MailboxReviewResult = {
  mailboxEmail: string;
  narrative: string[];
  suggestedActions: string[];
  aiAvailable: boolean;
  hitPageCap: boolean;
};

function daysLabel(days: number) {
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Plain, no-AI-needed phrasing — always available as a fallback, and the
 * only path when no provider is configured. */
function deterministicNarrative(thread: DigestThread): string {
  return thread.direction === "awaiting_them"
    ? `Waiting on ${thread.contact} to reply about "${thread.subject}" — you followed up ${daysLabel(thread.daysPending)} ago.`
    : `Please get back to ${thread.contact} about "${thread.subject}" — they wrote ${daysLabel(thread.daysPending)} ago.`;
}

/** Live, read-only mailbox review — fetches from Graph, computes in
 * memory, and returns the result directly. Nothing here writes email
 * content to any table; the only persistence is the token refresh already
 * inside getValidAccessToken (OAuth bookkeeping, not email data). */
export async function reviewMailbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection
): Promise<MailboxReviewResult> {
  const accessToken = await getValidAccessToken(admin, connection);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const activeInboxId = await findFolderIdByDisplayName(accessToken, ACTIVE_INBOX_FOLDER_NAME);

  const folderFetches = [
    fetchMessagesInFolder(accessToken, "inbox", since),
    fetchMessagesInFolder(accessToken, "sentitems", since),
    ...(activeInboxId ? [fetchMessagesInFolder(accessToken, activeInboxId, since)] : []),
  ];
  const results = await Promise.all(folderFetches);

  const hitPageCap = results.some((r) => r.hitPageCap);
  const byId = new Map<string, MailboxSnapshotMessage>();
  for (const r of results) {
    for (const m of r.messages) byId.set(m.id, m);
  }

  // One entry per conversation — the latest message determines who's
  // waiting on whom right now.
  const latestByThread = new Map<string, MailboxSnapshotMessage>();
  for (const m of byId.values()) {
    const existing = latestByThread.get(m.conversationId);
    if (!existing || m.receivedDateTime > existing.receivedDateTime) {
      latestByThread.set(m.conversationId, m);
    }
  }

  const myEmail = connection.mailbox_email.toLowerCase();
  const now = Date.now();

  const threads: DigestThread[] = [];
  for (const m of latestByThread.values()) {
    const fromAddress = m.from?.emailAddress?.address?.toLowerCase() ?? "";
    const isFromMe = fromAddress === myEmail;
    const daysPending = Math.max(
      0,
      Math.floor((now - new Date(m.receivedDateTime).getTime()) / (24 * 60 * 60 * 1000))
    );
    const contact = isFromMe
      ? m.toRecipients?.[0]?.emailAddress?.name ?? m.toRecipients?.[0]?.emailAddress?.address ?? "Unknown"
      : m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown";

    threads.push({
      subject: m.subject || "(no subject)",
      contact,
      direction: isFromMe ? "awaiting_them" : "awaiting_you",
      daysPending,
      snippet: (m.bodyPreview ?? "").slice(0, 200),
    });
  }
  threads.sort((a, b) => b.daysPending - a.daysPending);

  const aiSettings = await getActiveAiSettings(admin);
  let narrative = threads.map(deterministicNarrative);
  let suggestedActions: string[] = [];

  if (aiSettings) {
    const bounded = threads.slice(0, MAX_DIGEST_THREADS);
    try {
      const result = await callMailboxReviewAi(bounded, aiSettings);
      if (result.narrative.length > 0) narrative = result.narrative;
      suggestedActions = result.suggestedActions;
    } catch (err) {
      console.error("Mailbox review AI step failed", err);
      // Falls back to the deterministic narrative already computed above.
    }
  }

  return {
    mailboxEmail: connection.mailbox_email,
    narrative,
    suggestedActions,
    aiAvailable: Boolean(aiSettings),
    hitPageCap,
  };
}

const TOOL_NAME = "report_mailbox_narrative";
const TOOL_DESCRIPTION =
  "Write a plain-language narrative briefing of what's pending in this mailbox, one sentence per thread.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    narrative: {
      type: "array",
      items: {
        type: "string",
        description:
          "One natural, second-person sentence describing what's pending on a single thread — reference the actual topic when the preview reveals it, e.g. \"You still need to send Attilio the quote he asked for 12 days ago\" rather than a generic \"reply to Attilio\". Skip a thread only if it's clearly trivial or already resolved-sounding.",
      },
    },
    suggested_actions: {
      type: "array",
      items: { type: "string" },
      description: "A short, prioritized list of concrete next actions for today.",
    },
  },
  required: ["narrative", "suggested_actions"],
} as const;

function buildDigestPrompt(threads: DigestThread[]) {
  const lines = threads
    .map(
      (t) =>
        `- [${t.direction === "awaiting_you" ? "awaiting your reply" : "awaiting their reply"}, ${daysLabel(t.daysPending)}] "${t.subject}" with ${t.contact}: ${t.snippet || "(no preview)"}`
    )
    .join("\n");

  return `You're writing a short daily mailbox briefing for someone, in plain second-person language — like a sharp assistant telling them what's pending. Below are their open email threads from the last ${LOOKBACK_DAYS} days (Inbox and Sent Items only), most overdue first, each marked whether they're waiting on a reply from someone else ("awaiting their reply") or someone is waiting on a reply from them ("awaiting your reply"), plus a short preview of the last message.

Write one sentence per thread worth mentioning, ordered most urgent first, in the exact style of these examples: "Please get back to Jordan — he asked about the renewal pricing 6 days ago." / "You still haven't heard back from Attilio on the quote you sent 12 days ago." Don't invent detail beyond what's shown. Then give a short, prioritized list of concrete actions for today.

Threads:
${lines || "None."}

Use the ${TOOL_NAME} tool.`;
}

async function callMailboxReviewAi(
  threads: DigestThread[],
  settings: ActiveAiSettings
): Promise<{ narrative: string[]; suggestedActions: string[] }> {
  const prompt = buildDigestPrompt(threads);
  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  return {
    narrative: Array.isArray(parsed?.narrative) ? parsed.narrative : [],
    suggestedActions: Array.isArray(parsed?.suggested_actions) ? parsed.suggested_actions : [],
  };
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
      max_tokens: 1024,
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
