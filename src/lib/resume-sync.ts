import {
  findFolderIdByDisplayName,
  fetchResumeCandidateMessages,
  fetchMessageAttachments,
  fetchRawAttachmentDebugInfo,
} from "@/lib/microsoft-graph";
import { getValidAccessToken } from "@/lib/mail-sync";
import type { MailConnection } from "@/lib/types";

// Fixed lookback, no incremental checkpoint. This is a manual, occasional-use
// button on an inherently low-volume folder (a resumes inbox, not a whole
// mailbox) — the complexity an incremental checkpoint would add (handling
// clock skew, a folder rename silently resetting state) isn't worth it here.
// The (graph_message_id, graph_attachment_id) unique constraint on `resumes`
// makes re-scanning the same window on every click safe regardless.
const LOOKBACK_DAYS = 180;

export type ResumeSyncResult = {
  scanned: number;
  imported: number;
  hitPageCap: boolean;
  // TEMPORARY — see fetchRawAttachmentDebugInfo's own comment. Remove this
  // field (and its one call site below) once resurfacing "imported 0" is
  // actually understood and fixed.
  debug: string[];
};

/**
 * Pulls new PDF resumes out of one folder in the given user's connected
 * mailbox and stores them — no AI involved here at all (see
 * resume-screening.ts for that, run separately). Reuses the exact same
 * token-refresh helper every other mailbox feature in this app shares
 * (getValidAccessToken), so it inherits the same AADSTS53003 Conditional
 * Access risk documented there: a manual click is less exposed than a cron
 * (an interactive click's token is often still within its expiry buffer, so
 * no refresh is even attempted), but not provably immune to it.
 */
export async function syncResumeFolder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  connection: MailConnection
): Promise<ResumeSyncResult> {
  const folderName = connection.resume_folder_name?.trim();
  if (!folderName) {
    throw new Error("Set a resume folder name in Recruitment settings first.");
  }

  // Resolved fresh every sync rather than cached: a resolve is one or two
  // cheap Graph calls, and caching would risk a silent staleness bug if the
  // folder ever gets renamed — not worth it for a manual, low-frequency
  // action.
  const accessToken = await getValidAccessToken(admin, connection);
  const folderId = await findFolderIdByDisplayName(accessToken, folderName);
  if (!folderId) {
    throw new Error(`Folder "${folderName}" wasn't found in this mailbox.`);
  }

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { messages, hitPageCap } = await fetchResumeCandidateMessages(accessToken, folderId, sinceIso);

  let imported = 0;
  const debug: string[] = [];

  for (const message of messages) {
    const attachments = await fetchMessageAttachments(accessToken, message.id);
    if (attachments.length === 0) {
      debug.push(...(await fetchRawAttachmentDebugInfo(accessToken, message.id)));
      continue;
    }

    const { data: existing, error: existingError } = await admin
      .from("resumes")
      .select("graph_attachment_id")
      .eq("graph_message_id", message.id);
    if (existingError) {
      console.error("syncResumeFolder: failed to check existing rows", existingError);
      continue;
    }
    const existingIds = new Set(
      (existing ?? []).map((r: { graph_attachment_id: string }) => r.graph_attachment_id)
    );

    for (const attachment of attachments) {
      // Dedup key: (graph_message_id, graph_attachment_id) — a message can
      // carry more than one PDF, so the pair, not just the message id, is
      // the right granularity. Matches the DB unique constraint.
      if (existingIds.has(attachment.id)) continue;

      const bytes = Buffer.from(attachment.contentBytes, "base64");
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${connection.user_id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await admin.storage
        .from("resumes")
        .upload(path, bytes, { contentType: "application/pdf" });
      if (uploadError) {
        console.error("syncResumeFolder: upload failed", uploadError);
        continue;
      }

      const { error: insertError } = await admin.from("resumes").insert({
        connection_user_id: connection.user_id,
        graph_message_id: message.id,
        graph_attachment_id: attachment.id,
        received_at: message.receivedDateTime,
        sender_name: message.from?.emailAddress?.name ?? null,
        sender_email: message.from?.emailAddress?.address ?? null,
        subject: message.subject ?? null,
        file_name: attachment.name,
        storage_path: path,
        file_size_bytes: attachment.size,
      });
      if (insertError) {
        // Matches uploadInteractionDocument's rollback — don't leave an
        // orphaned file in storage with no row pointing at it.
        await admin.storage.from("resumes").remove([path]);
        console.error("syncResumeFolder: row insert failed", insertError);
        continue;
      }

      imported += 1;
    }
  }

  await admin
    .from("mail_connections")
    .update({ resume_sync_last_synced_at: new Date().toISOString() })
    .eq("user_id", connection.user_id);

  return { scanned: messages.length, imported, hitPageCap, debug };
}
