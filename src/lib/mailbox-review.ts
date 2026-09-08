import { getActiveAiSettings } from "@/lib/ai/settings";
import type { ActiveAiSettings } from "@/lib/ai";
import type { MailConnection, MailboxSnapshotMessageRow } from "@/lib/types";
import { assertAsciiHeaderValue } from "@/lib/ascii-check";
import { syncMailboxSnapshot } from "@/lib/mailbox-snapshot";

export const DEFAULT_LOOKBACK_DAYS = 30;
export const MAX_LOOKBACK_DAYS = 90;
// Bounds the AI prompt size — the most-overdue threads (the ones that
// matter most) go in first; anything past this cap only gets the plain
// deterministic sentence, not an AI-written one.
const MAX_DIGEST_THREADS = 40;

// Heuristic, not a real classifier — Graph doesn't expose a "this is a
// newsletter" signal, so this matches on sender address/display name
// patterns that are overwhelmingly automated mail (notifications,
// newsletters, alerts) rather than a real person writing to you. A
// message that happens to come from an address containing one of these
// substrings but is genuinely a person (rare) would be excluded too —
// an acceptable false-positive rate for what this is (a noise filter for
// a digest, not a security control). The user's own typed exclude terms
// (see isExcludedByUserTerms) are additional to this, not a replacement.
const NOISE_SENDER_PATTERNS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "notification",
  "notifications",
  "newsletter",
  "newsletters",
  "digest",
  "alert",
  "alerts",
  "mailer-daemon",
  "postmaster",
  "updates@",
  "news@",
  "marketing@",
];

function isLikelyNoise(message: MailboxSnapshotMessageRow): boolean {
  const from = message.from_email?.toLowerCase() ?? "";
  const fromName = message.from_name?.toLowerCase() ?? "";
  return NOISE_SENDER_PATTERNS.some((p) => from.includes(p) || fromName.includes(p));
}

/** Parses the user's raw "what to exclude" text (comma or newline
 * separated, e.g. "notifications, CG Helpdesk, billing@vendor.com") into
 * lowercased terms, matched against sender address, sender display name,
 * and subject — broader than the built-in noise filter's sender-only
 * match, since a term like a helpdesk's name is often more recognizable
 * in the display name or subject than the raw address. This only affects
 * what shows up in an analysis — the mailbox snapshot is still stored;
 * for senders that should never even be stored, see
 * mail_connections.sync_excluded_senders instead. */
function parseExcludeTerms(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function isExcludedByUserTerms(message: MailboxSnapshotMessageRow, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const from = message.from_email?.toLowerCase() ?? "";
  const fromName = message.from_name?.toLowerCase() ?? "";
  const subject = (message.subject ?? "").toLowerCase();
  return terms.some((t) => from.includes(t) || fromName.includes(t) || subject.includes(t));
}

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
  focusIgnored: boolean;
  /** When the local snapshot was last refreshed (see mailbox-snapshot.ts)
   * — this replaces the old "live scan hit its page cap" notice, since
   * the review no longer talks to Graph directly at all; freshness is
   * about the background sync's own cadence now, not this call. */
  syncedAsOf: string | null;
};

export type MailboxReviewOptions = {
  /** Clamped to [1, MAX_LOOKBACK_DAYS] by the caller-facing action, but
   * clamped again here defensively since this function is also callable
   * directly. */
  lookbackDays?: number;
  /** Free-text description of what the user wants analyzed — if omitted,
   * falls back to the original "who's waiting on whom" reply-tracking
   * digest. Only honored when an AI provider is configured; if not,
   * `focusIgnored` comes back true so the caller can say so. */
  focus?: string;
  /** Raw "what to exclude" text — see parseExcludeTerms. */
  excludeTerms?: string;
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

/** Reads the signed-in user's local mailbox snapshot (see
 * mailbox-snapshot.ts) — no live Graph calls happen here at all anymore;
 * a background cron keeps the snapshot fresh every ~30 minutes. The one
 * exception is a user's very first ever review: if they've never been
 * synced yet, this bootstraps with one inline sync so the first click
 * isn't just empty while waiting on the next cron run. */
export async function reviewMailbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection,
  options: MailboxReviewOptions = {}
): Promise<MailboxReviewResult> {
  const lookbackDays = Math.min(Math.max(Math.trunc(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS), 1), MAX_LOOKBACK_DAYS);
  const focus = options.focus?.trim() || null;
  const excludeTerms = parseExcludeTerms(options.excludeTerms);

  let syncedAsOf = connection.snapshot_synced_at;
  if (!syncedAsOf) {
    await syncMailboxSnapshot(admin, connection);
    syncedAsOf = new Date().toISOString();
  }

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error: readError } = await admin
    .from("mailbox_snapshot_messages")
    .select("*")
    .eq("user_id", connection.user_id)
    .gte("received_at", since)
    .order("received_at", { ascending: true });
  if (readError) {
    // A missing table/column (a migration not yet run) or any other DB
    // failure would otherwise look identical to "genuinely no rows" —
    // surface it instead of silently reporting "nothing pending."
    throw new Error(`Failed to read mailbox snapshot: ${readError.message}`);
  }

  const byId = new Map<string, MailboxSnapshotMessageRow>();
  for (const m of (rows ?? []) as MailboxSnapshotMessageRow[]) {
    if (isLikelyNoise(m)) continue;
    if (isExcludedByUserTerms(m, excludeTerms)) continue;
    byId.set(m.id, m);
  }

  // One entry per conversation — the latest message determines who's
  // waiting on whom right now.
  const latestByThread = new Map<string, MailboxSnapshotMessageRow>();
  for (const m of byId.values()) {
    const existing = latestByThread.get(m.conversation_id);
    if (!existing || m.received_at > existing.received_at) {
      latestByThread.set(m.conversation_id, m);
    }
  }

  const myEmail = connection.mailbox_email.toLowerCase();
  const now = Date.now();

  const threads: DigestThread[] = [];
  for (const m of latestByThread.values()) {
    const fromAddress = m.from_email?.toLowerCase() ?? "";
    const isFromMe = fromAddress === myEmail;
    const daysPending = Math.max(0, Math.floor((now - new Date(m.received_at).getTime()) / (24 * 60 * 60 * 1000)));
    const contact = isFromMe ? m.to_name ?? m.to_email ?? "Unknown" : m.from_name ?? m.from_email ?? "Unknown";

    threads.push({
      subject: m.subject || "(no subject)",
      contact,
      direction: isFromMe ? "awaiting_them" : "awaiting_you",
      daysPending,
      snippet: (m.body_preview ?? "").slice(0, 200),
    });
  }
  threads.sort((a, b) => b.daysPending - a.daysPending);

  const aiSettings = await getActiveAiSettings(admin);
  let narrative = threads.map(deterministicNarrative);
  let suggestedActions: string[] = [];
  // A custom focus needs an AI provider to actually honor it — the
  // deterministic fallback only knows how to write the fixed
  // "who's waiting on whom" sentence, so a focus with no provider
  // configured is silently ignored rather than pretended-to.
  const focusIgnored = Boolean(focus) && !aiSettings;

  if (aiSettings) {
    const bounded = threads.slice(0, MAX_DIGEST_THREADS);
    try {
      const result = await callMailboxReviewAi(bounded, lookbackDays, focus, aiSettings);
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
    focusIgnored,
    syncedAsOf,
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

function buildDigestPrompt(threads: DigestThread[], lookbackDays: number, focus: string | null) {
  const lines = threads
    .map(
      (t) =>
        `- [${t.direction === "awaiting_you" ? "awaiting your reply" : "awaiting their reply"}, ${daysLabel(t.daysPending)}] "${t.subject}" with ${t.contact}: ${t.snippet || "(no preview)"}`
    )
    .join("\n");

  const instruction = focus
    ? `The user specifically asked for this: "${focus}" — write the briefing to answer that, using only the threads below. If none of the threads below are relevant to what they asked, say so plainly instead of forcing an answer. Still give a short, prioritized list of concrete next actions for today.`
    : `Write one sentence per thread worth mentioning, ordered most urgent first, in the exact style of these examples: "Please get back to Jordan — he asked about the renewal pricing 6 days ago." / "You still haven't heard back from Attilio on the quote you sent 12 days ago." Don't invent detail beyond what's shown. Then give a short, prioritized list of concrete actions for today.`;

  return `You're writing a short mailbox briefing for someone, in plain second-person language — like a sharp assistant telling them what's pending. Below are their open email threads from the last ${lookbackDays} days across their whole mailbox (Deleted Items, Junk, and Drafts excluded — automated notifications/newsletters/alerts and anything they asked to exclude are already filtered out too), most overdue first, each marked whether they're waiting on a reply from someone else ("awaiting their reply") or someone is waiting on a reply from them ("awaiting your reply"), plus a short preview of the last message.

${instruction}

Threads:
${lines || "None."}

Use the ${TOOL_NAME} tool.`;
}

async function callMailboxReviewAi(
  threads: DigestThread[],
  lookbackDays: number,
  focus: string | null,
  settings: ActiveAiSettings
): Promise<{ narrative: string[]; suggestedActions: string[] }> {
  const prompt = buildDigestPrompt(threads, lookbackDays, focus);
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
