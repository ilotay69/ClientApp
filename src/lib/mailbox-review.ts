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
// Bounds the AI prompt size — the deterministic lists below still cover
// every thread found; only the AI's quote/project pass is capped, and the
// most-overdue threads (the ones that matter most) go in first.
const MAX_DIGEST_THREADS = 40;

export type ThreadItem = {
  subject: string;
  contact: string;
  daysPending: number;
  snippet: string;
};

type FlaggedItem = { subject: string; contact: string; note: string };

export type MailboxReviewResult = {
  mailboxEmail: string;
  awaitingYourReply: ThreadItem[];
  awaitingTheirReply: ThreadItem[];
  quotesFlagged: FlaggedItem[];
  projectMentions: FlaggedItem[];
  suggestedActions: string[];
  aiAvailable: boolean;
  hitPageCap: boolean;
};

type DigestThread = {
  subject: string;
  contact: string;
  direction: "awaiting_you" | "awaiting_them";
  daysPending: number;
  snippet: string;
};

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
  const kept = [...byId.values()];

  // One entry per conversation — the latest message determines who's
  // waiting on whom right now.
  const latestByThread = new Map<string, MailboxSnapshotMessage>();
  for (const m of kept) {
    const existing = latestByThread.get(m.conversationId);
    if (!existing || m.receivedDateTime > existing.receivedDateTime) {
      latestByThread.set(m.conversationId, m);
    }
  }

  const myEmail = connection.mailbox_email.toLowerCase();
  const now = Date.now();

  const awaitingYourReply: ThreadItem[] = [];
  const awaitingTheirReply: ThreadItem[] = [];
  const digestThreads: DigestThread[] = [];

  for (const m of latestByThread.values()) {
    const fromAddress = m.from?.emailAddress?.address?.toLowerCase() ?? "";
    const isFromMe = fromAddress === myEmail;
    const daysPending = Math.max(
      0,
      Math.floor((now - new Date(m.receivedDateTime).getTime()) / (24 * 60 * 60 * 1000))
    );
    const snippet = (m.bodyPreview ?? "").slice(0, 200);
    const contact = isFromMe
      ? m.toRecipients?.[0]?.emailAddress?.name ?? m.toRecipients?.[0]?.emailAddress?.address ?? "Unknown"
      : m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown";

    const item: ThreadItem = { subject: m.subject || "(no subject)", contact, daysPending, snippet };
    (isFromMe ? awaitingTheirReply : awaitingYourReply).push(item);

    digestThreads.push({
      subject: item.subject,
      contact,
      direction: isFromMe ? "awaiting_them" : "awaiting_you",
      daysPending,
      snippet,
    });
  }

  awaitingYourReply.sort((a, b) => b.daysPending - a.daysPending);
  awaitingTheirReply.sort((a, b) => b.daysPending - a.daysPending);

  const aiSettings = await getActiveAiSettings(admin);
  let quotesFlagged: FlaggedItem[] = [];
  let projectMentions: FlaggedItem[] = [];
  let suggestedActions: string[] = [];

  if (aiSettings) {
    const bounded = [...digestThreads].sort((a, b) => b.daysPending - a.daysPending).slice(0, MAX_DIGEST_THREADS);
    try {
      const result = await callMailboxReviewAi(bounded, aiSettings);
      quotesFlagged = result.quotesFlagged;
      projectMentions = result.projectMentions;
      suggestedActions = result.suggestedActions;
    } catch (err) {
      console.error("Mailbox review AI step failed", err);
      // The deterministic lists above are still returned either way.
    }
  }

  return {
    mailboxEmail: connection.mailbox_email,
    awaitingYourReply,
    awaitingTheirReply,
    quotesFlagged,
    projectMentions,
    suggestedActions,
    aiAvailable: Boolean(aiSettings),
    hitPageCap,
  };
}

const TOOL_NAME = "report_mailbox_flags";
const TOOL_DESCRIPTION =
  "Flag which of these email threads are quote-related (and whether they seem stuck) and which mention a project's status, plus a short prioritized action list.";
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    quotes_flagged: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          contact: { type: "string" },
          note: {
            type: "string",
            description:
              "Why this looks quote-related and its apparent state, e.g. 'Quote requested, nothing sent yet' or 'Quote sent, no reply in 9 days'.",
          },
        },
        required: ["subject", "contact", "note"],
      },
    },
    project_mentions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          contact: { type: "string" },
          note: { type: "string", description: "What this suggests about a project's status." },
        },
        required: ["subject", "contact", "note"],
      },
    },
    suggested_actions: {
      type: "array",
      items: { type: "string" },
      description: "A short, prioritized list of concrete next actions for today.",
    },
  },
  required: ["quotes_flagged", "project_mentions", "suggested_actions"],
} as const;

function buildDigestPrompt(threads: DigestThread[]) {
  const lines = threads
    .map(
      (t) =>
        `- [${t.direction === "awaiting_you" ? "awaiting your reply" : "awaiting their reply"}, ${t.daysPending}d] "${t.subject}" with ${t.contact}: ${t.snippet || "(no preview)"}`
    )
    .join("\n");

  return `You're helping someone triage their own mailbox for the day. Below are their most overdue open email threads from the last ${LOOKBACK_DAYS} days (one line per thread, most overdue first). For each thread, decide only two things: (1) does it look related to a price quote, and if so does it seem stuck (no reply for a while) or just newly sent; (2) does it mention an ongoing project's status. Skip threads that are neither. Then give a short, prioritized list of concrete actions for today. Don't invent detail beyond what's shown.

Threads:
${lines || "None."}

Use the ${TOOL_NAME} tool.`;
}

async function callMailboxReviewAi(
  threads: DigestThread[],
  settings: ActiveAiSettings
): Promise<{ quotesFlagged: FlaggedItem[]; projectMentions: FlaggedItem[]; suggestedActions: string[] }> {
  const prompt = buildDigestPrompt(threads);
  const parsed =
    settings.provider === "openai"
      ? await callOpenAiTool(prompt, settings.apiKey, settings.model)
      : await callAnthropicTool(prompt, settings.apiKey, settings.model);

  return {
    quotesFlagged: Array.isArray(parsed?.quotes_flagged) ? parsed.quotes_flagged : [],
    projectMentions: Array.isArray(parsed?.project_mentions) ? parsed.project_mentions : [],
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
