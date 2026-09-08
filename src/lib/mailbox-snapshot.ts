import {
  fetchMailboxWideMessages,
  getExcludedSystemFolderIds,
  type MailboxSnapshotMessage as GraphSnapshotMessage,
} from "@/lib/microsoft-graph";
import { getValidAccessToken } from "@/lib/mail-sync";
import type { MailConnection } from "@/lib/types";

export const SNAPSHOT_RETENTION_DAYS = 90;
// A first-ever sync only backfills a short recent window, not the full
// 90-day retention window — a 90-day backfill was still slow even after
// batching the upserts, just from the sheer number of Graph pages a busy
// mailbox needs. Every sync after the first is incremental (since the
// last checkpoint), and that checkpoint only ever advances forward — so
// the stored history grows a day at a time and naturally reaches the
// full 90 days on its own after about 90 - INITIAL_BACKFILL_DAYS days of
// normal operation, without ever needing a slow bulk catch-up.
const INITIAL_BACKFILL_DAYS = 7;
// A first-ever sync's window is much smaller now (see above), so this
// cap is sized for that, not a full 90-day backfill.
const BACKFILL_MAX_PAGES = 20;
// Batched, not one row per round trip — even a smaller backfill can be
// a few hundred messages, and upserting them one at a time turned a
// few Graph pages into hundreds of sequential Supabase calls, which was
// what actually made a first-time "Analyze my mailbox" click feel slow
// (not the Graph fetch itself).
const UPSERT_CHUNK_SIZE = 200;

/** Parses a raw "never store senders" string (comma or newline separated)
 * into lowercased terms, matched against sender address and display name
 * — same shape as the review's own exclude-terms parsing, but this list
 * controls what's written to mailbox_snapshot_messages in the first
 * place, not just what's shown in an analysis. */
function parseSenderTerms(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function matchesSenderTerms(message: GraphSnapshotMessage, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const from = message.from?.emailAddress?.address?.toLowerCase() ?? "";
  const fromName = message.from?.emailAddress?.name?.toLowerCase() ?? "";
  return terms.some((t) => from.includes(t) || fromName.includes(t));
}

/** Syncs one user's mailbox snapshot: fetches everything mailbox-wide
 * since the last checkpoint (or a short recent window on a first run —
 * see INITIAL_BACKFILL_DAYS), drops system folders and never-store
 * senders, upserts the rest, then prunes anything older than the 90-day
 * retention window and advances the checkpoint. Returns counts for the
 * cron's own log/response. */
export async function syncMailboxSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection
): Promise<{ upserted: number; skipped: number; pruned: number }> {
  const accessToken = await getValidAccessToken(admin, connection);

  const since =
    connection.snapshot_synced_at ??
    new Date(Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const isFirstSync = !connection.snapshot_synced_at;

  const [excludedFolderIds, { messages }] = await Promise.all([
    getExcludedSystemFolderIds(accessToken),
    fetchMailboxWideMessages(accessToken, since, isFirstSync ? BACKFILL_MAX_PAGES : undefined),
  ]);

  const senderTerms = parseSenderTerms(connection.sync_excluded_senders);

  let skipped = 0;
  let latestReceivedAt = since;
  const now = new Date().toISOString();
  const rowsToUpsert: {
    user_id: string;
    graph_message_id: string;
    conversation_id: string;
    subject: string;
    from_name: string | null;
    from_email: string | null;
    to_name: string | null;
    to_email: string | null;
    received_at: string;
    sent_at: string | null;
    web_link: string;
    body_preview: string;
    parent_folder_id: string;
    is_flagged: boolean;
    synced_at: string;
  }[] = [];

  for (const m of messages) {
    if (m.receivedDateTime > latestReceivedAt) latestReceivedAt = m.receivedDateTime;

    if (excludedFolderIds.has(m.parentFolderId) || matchesSenderTerms(m, senderTerms)) {
      skipped += 1;
      continue;
    }

    rowsToUpsert.push({
      user_id: connection.user_id,
      graph_message_id: m.id,
      conversation_id: m.conversationId,
      subject: m.subject,
      from_name: m.from?.emailAddress?.name ?? null,
      from_email: m.from?.emailAddress?.address ?? null,
      to_name: m.toRecipients?.[0]?.emailAddress?.name ?? null,
      to_email: m.toRecipients?.[0]?.emailAddress?.address ?? null,
      received_at: m.receivedDateTime,
      sent_at: m.sentDateTime ?? null,
      web_link: m.webLink,
      body_preview: (m.bodyPreview ?? "").slice(0, 500),
      parent_folder_id: m.parentFolderId,
      is_flagged: m.flag?.flagStatus === "flagged",
      synced_at: now,
    });
  }

  let upserted = 0;
  for (let i = 0; i < rowsToUpsert.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rowsToUpsert.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await admin
      .from("mailbox_snapshot_messages")
      .upsert(chunk, { onConflict: "user_id,graph_message_id" });
    if (!error) upserted += chunk.length;
  }

  const cutoffIso = new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count: pruned } = await admin
    .from("mailbox_snapshot_messages")
    .delete({ count: "exact" })
    .eq("user_id", connection.user_id)
    .lt("received_at", cutoffIso);

  await admin
    .from("mail_connections")
    .update({ snapshot_synced_at: latestReceivedAt })
    .eq("user_id", connection.user_id);

  return { upserted, skipped, pruned: pruned ?? 0 };
}

/** Immediately deletes any already-stored snapshot rows matching the
 * given sender terms — used when a user updates their "never store"
 * list, so it actually removes what was captured before the exclusion
 * existed, not just prevents future syncs from re-adding it. */
export async function purgeSnapshotMessagesFromSenders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  rawSenderTerms: string | null | undefined
): Promise<number> {
  const terms = parseSenderTerms(rawSenderTerms);
  if (terms.length === 0) return 0;

  const { data: rows } = await admin
    .from("mailbox_snapshot_messages")
    .select("id, from_email, from_name")
    .eq("user_id", userId);

  const idsToDelete = (rows ?? [])
    .filter((r: { from_email: string | null; from_name: string | null }) => {
      const from = (r.from_email ?? "").toLowerCase();
      const fromName = (r.from_name ?? "").toLowerCase();
      return terms.some((t) => from.includes(t) || fromName.includes(t));
    })
    .map((r: { id: string }) => r.id);

  if (idsToDelete.length === 0) return 0;
  await admin.from("mailbox_snapshot_messages").delete().in("id", idsToDelete);
  return idsToDelete.length;
}
