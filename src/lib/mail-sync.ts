import { refreshAccessToken, fetchRecentMessages, type GraphMessage } from "@/lib/microsoft-graph";
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

const SUBJECT_PREFIXES: { prefix: string; type: "quote" | "project" }[] = [
  { prefix: "quote", type: "quote" },
  { prefix: "project", type: "project" },
];

export function detectEmailType(subject: string) {
  const normalized = subject.trim().toLowerCase();
  return SUBJECT_PREFIXES.find((p) => normalized.startsWith(p.prefix))?.type ?? null;
}

function domainOf(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? null;
}

type ClientContact = { id: string; primary_contact_email: string | null };

export function matchClientForMessage(
  clients: ClientContact[],
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
      if (!client.primary_contact_email) continue;
      const contactLower = client.primary_contact_email.toLowerCase();

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

  return null;
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

/**
 * Syncs one connected mailbox: pulls messages received since the last sync,
 * keeps the ones whose subject starts with "quote" or "project" and whose
 * sender/recipient matches a known client, and stores them as email_links.
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

  const { data: clients } = await admin
    .from("clients")
    .select("id, primary_contact_email");

  let matched = 0;
  let latestReceivedAt = since;

  for (const message of messages) {
    if (message.receivedDateTime > latestReceivedAt) {
      latestReceivedAt = message.receivedDateTime;
    }

    const clientId = matchClientForMessage(clients ?? [], message);
    if (!clientId) continue;

    // Every email matched to a known client is kept now (not just ones
    // whose subject starts with "quote"/"project") so the AI suggestion job
    // has real context. The subject prefix still drives the type badge.
    const type = detectEmailType(message.subject ?? "") ?? "general";

    const { error } = await admin.from("email_links").upsert(
      {
        client_id: clientId,
        type,
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
    if (!error) matched += 1;
  }

  await admin
    .from("mail_connections")
    .update({ last_synced_at: latestReceivedAt })
    .eq("user_id", connection.user_id);

  return { scanned: messages.length, matched };
}
