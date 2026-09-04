import {
  refreshAccessToken,
  fetchRecentMessages,
  fetchFlaggedMessages,
  type GraphMessage,
} from "@/lib/microsoft-graph";
import type { MailConnection } from "@/lib/types";

// Free/consumer email domains are excluded from domain-based matching so we
// don't accidentally lump together unrelated clients who happen to both use
// gmail.com, etc. Exact address matches still work fine for these.
const COMMON_FREE_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "aol.com",
]);

const CATEGORY_TYPES: { category: string; type: "quote" | "project" }[] = [
  { category: "quote", type: "quote" },
  { category: "project", type: "project" },
];

/** Sync scope: a message only counts if it's been tagged with the Outlook
 * category "Quote" or "Project" (case-insensitive) — everything else is
 * skipped regardless of who it's from/to. */
export function detectEmailType(categories: string[] | undefined) {
  const normalized = (categories ?? []).map((c) => c.trim().toLowerCase());
  return CATEGORY_TYPES.find((c) => normalized.includes(c.category))?.type ?? null;
}

function domainOf(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? null;
}

/** Every email address known for a client — its primary contact plus
 * every row in client_contacts — so a message to/from ANY of a client's
 * people counts as that client's, not just their primary contact. */
export type ClientEmails = { id: string; emails: string[] };

export function matchClientForMessage(
  clients: ClientEmails[],
  message: GraphMessage
): string | null {
  const participantEmails = [
    message.from?.emailAddress?.address,
    ...(message.toRecipients ?? []).map((r) => r.emailAddress?.address),
  ].filter((e): e is string => Boolean(e));

  for (const participant of participantEmails) {
    const participantLower = participant.toLowerCase();
    const participantDomain = domainOf(participantLower);

    for (const client of clients) {
      for (const contactEmail of client.emails) {
        const contactLower = contactEmail.toLowerCase();

        if (contactLower === participantLower) return client.id;

        const contactDomain = domainOf(contactLower);
        if (
          contactDomain &&
          contactDomain === participantDomain &&
          !COMMON_FREE_DOMAINS.has(contactDomain)
        ) {
          return client.id;
        }
      }
    }
  }

  return null;
}

/** Outlook's "Follow up" flag — `flagged` means still open, `complete`
 * means resolved, `notFlagged`/missing means never flagged. Only "still
 * open" counts as needing follow-up. */
export function isFlaggedForFollowup(message: GraphMessage): boolean {
  return message.flag?.flagStatus === "flagged";
}

/** Every email address known for every client, for matching. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadClientEmails(admin: any): Promise<ClientEmails[]> {
  const [{ data: clients }, { data: contacts }] = await Promise.all([
    admin.from("clients").select("id, primary_contact_email"),
    admin.from("client_contacts").select("client_id, email"),
  ]);

  const emailsByClient = new Map<string, string[]>();
  for (const c of (clients ?? []) as { id: string; primary_contact_email: string | null }[]) {
    if (c.primary_contact_email) emailsByClient.set(c.id, [c.primary_contact_email]);
  }
  for (const c of (contacts ?? []) as { client_id: string; email: string | null }[]) {
    if (!c.email) continue;
    const existing = emailsByClient.get(c.client_id) ?? [];
    existing.push(c.email);
    emailsByClient.set(c.client_id, existing);
  }
  return [...emailsByClient.entries()].map(([id, emails]) => ({ id, emails }));
}

/**
 * Refreshes the connection's access token if it's expired (or close to it),
 * persisting the new tokens. Returns a usable access token either way.
 */
export async function getValidAccessToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection
): Promise<string> {
  const expiresAt = new Date(connection.expires_at).getTime();
  const bufferMs = 60_000;

  if (Date.now() < expiresAt - bufferMs) {
    return connection.access_token;
  }

  const tokens = await refreshAccessToken(connection.refresh_token);
  const expiresIso = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await admin
    .from("mail_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresIso,
    })
    .eq("user_id", connection.user_id);

  return tokens.access_token;
}

/** Inserts (or, if the message was already linked, flags) one matched
 * email_links row. Shared by both the incremental category sync and the
 * full flagged-message scan below. */
async function upsertEmailLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection,
  clientId: string,
  message: GraphMessage,
  type: "quote" | "project" | "followup",
  isFlagged: boolean
): Promise<boolean> {
  const { error } = await admin.from("email_links").upsert(
    {
      client_id: clientId,
      type,
      is_flagged: isFlagged,
      subject: message.subject,
      from_name: message.from?.emailAddress?.name ?? null,
      from_email: message.from?.emailAddress?.address ?? "unknown",
      received_at: message.receivedDateTime,
      web_link: message.webLink,
      body_preview: message.bodyPreview?.slice(0, 500) ?? null,
      graph_message_id: message.id,
      connection_user_id: connection.user_id,
    },
    { onConflict: "graph_message_id", ignoreDuplicates: true }
  );
  if (error) return false;

  // A message synced earlier (e.g. via its Quote/Project category, before
  // anyone flagged it) won't have been touched by the insert above once it
  // already exists — flags are usually added well after an email first
  // shows up, so this catches that case instead of only ever setting
  // is_flagged at the moment of first insert.
  if (isFlagged) {
    await admin
      .from("email_links")
      .update({ is_flagged: true })
      .eq("graph_message_id", message.id)
      .eq("is_flagged", false);
  }

  return true;
}

/** Full scan for messages currently flagged for follow-up, independent of
 * the incremental "since last sync" checkpoint below — a flag is typically
 * added well after a message was first received/sent, often after the
 * checkpoint has already moved past it, so a scan bounded by receivedDateTime
 * would miss it. Matches against a client's primary contact or any of
 * their other saved contacts, sent or received. */
async function scanFlaggedMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection,
  accessToken: string,
  clientEmails: ClientEmails[]
): Promise<number> {
  const messages = await fetchFlaggedMessages(accessToken);

  let matched = 0;
  for (const message of messages) {
    const clientId = matchClientForMessage(clientEmails, message);
    if (!clientId) continue;

    const categoryType = detectEmailType(message.categories);
    const ok = await upsertEmailLink(admin, connection, clientId, message, categoryType ?? "followup", true);
    if (ok) matched += 1;
  }
  return matched;
}

/**
 * Syncs one connected mailbox: pulls messages received since the last sync
 * (inbox and sent — /me/messages is mailbox-wide) and keeps the ones tagged
 * with the Outlook category "Quote" or "Project" AND whose sender/recipient
 * matches a known client (their primary contact or any of their other saved
 * contacts). Separately, every currently-flagged-for-follow-up message
 * mailbox-wide is scanned and matched the same way, regardless of how old it
 * is — see scanFlaggedMessages.
 */
export async function syncMailConnection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection
): Promise<{ scanned: number; matched: number }> {
  const accessToken = await getValidAccessToken(admin, connection);

  // First sync looks back 30 days; after that, only what's new.
  const since =
    connection.last_synced_at ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const messages = await fetchRecentMessages(accessToken, since);
  const clientEmails = await loadClientEmails(admin);

  let matched = 0;
  let latestReceivedAt = since;

  for (const message of messages) {
    if (message.receivedDateTime > latestReceivedAt) {
      latestReceivedAt = message.receivedDateTime;
    }

    const categoryType = detectEmailType(message.categories);
    if (!categoryType) continue;

    const clientId = matchClientForMessage(clientEmails, message);
    if (!clientId) continue;

    const ok = await upsertEmailLink(
      admin,
      connection,
      clientId,
      message,
      categoryType,
      isFlaggedForFollowup(message)
    );
    if (ok) matched += 1;
  }

  await admin
    .from("mail_connections")
    .update({ last_synced_at: latestReceivedAt })
    .eq("user_id", connection.user_id);

  try {
    matched += await scanFlaggedMessages(admin, connection, accessToken, clientEmails);
  } catch (err) {
    console.error("Flagged-message scan failed — category sync above still completed", err);
  }

  return { scanned: messages.length, matched };
}
