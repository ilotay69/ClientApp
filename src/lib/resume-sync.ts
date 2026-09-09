import {
  findFolderIdByDisplayName,
  fetchResumeCandidateMessages,
  fetchMessageAttachments,
  htmlToPlainText,
} from "@/lib/microsoft-graph";
import { getValidAccessToken } from "@/lib/mail-sync";
import type { MailConnection } from "@/lib/types";

// Fixed lookback, no incremental checkpoint. This is a manual, occasional-use
// button on an inherently low-volume folder (a resumes inbox, not a whole
// mailbox) — the complexity an incremental checkpoint would add (handling
// clock skew, a folder rename silently resetting state) isn't worth it here.
// The dedup keys on `resumes` make re-scanning the same window on every
// click safe regardless.
const LOOKBACK_DAYS = 180;

// Caps how much of a notification email's body gets stored/sent to the AI —
// some job-board notifications embed a lot of boilerplate (unsubscribe
// footers, legal text) around the genuinely useful part (screening question
// answers). Generous enough to keep real content, not so large it dominates
// a batch's token budget when several rows carry one each.
const MAX_EMAIL_BODY_CHARS = 4000;

export type ResumeSyncResult = {
  scanned: number;
  imported: number;
  hitPageCap: boolean;
};

/**
 * Pulls every message in one folder of the given user's connected mailbox
 * into the `resumes` table — no AI involved here at all (see
 * resume-screening.ts for that, run separately). Every message becomes a
 * row, whether or not it carries a PDF/Word attachment: a job-board
 * "you have a new applicant" notification with no attachment still carries
 * real screening context in its own body (a candidate's answers to
 * screening questions, etc.), and staff can add the actual resume
 * afterward via upload or paste against the row this creates. A message
 * WITH one or more supported attachments gets one row per attachment
 * instead (each one still carries the same email body text).
 *
 * Reuses the exact same token-refresh helper every other mailbox feature in
 * this app shares (getValidAccessToken), so it inherits the same AADSTS53003
 * Conditional Access risk documented there: a manual click is less exposed
 * than a cron (an interactive click's token is often still within its
 * expiry buffer, so no refresh is even attempted), but not provably immune
 * to it.
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

  for (const message of messages) {
    const emailBodyText = message.body?.content
      ? htmlToPlainText(message.body.content).slice(0, MAX_EMAIL_BODY_CHARS)
      : null;
    const senderName = message.from?.emailAddress?.name ?? null;
    const senderEmail = message.from?.emailAddress?.address ?? null;

    const attachments = await fetchMessageAttachments(accessToken, message.id);

    // Every id already known for THIS message — both attachment-based rows
    // (graph_attachment_id set) and a notification-only row (null), so one
    // query covers both dedup checks below.
    const { data: existing, error: existingError } = await admin
      .from("resumes")
      .select("graph_attachment_id")
      .eq("graph_message_id", message.id);
    if (existingError) {
      console.error("syncResumeFolder: failed to check existing rows", existingError);
      continue;
    }
    const existingAttachmentIds = new Set(
      (existing ?? [])
        .map((r: { graph_attachment_id: string | null }) => r.graph_attachment_id)
        .filter((id: string | null): id is string => id !== null)
    );
    const hasNotificationOnlyRow = (existing ?? []).some(
      (r: { graph_attachment_id: string | null }) => r.graph_attachment_id === null
    );

    if (attachments.length === 0) {
      // Notification-only row — dedup key is graph_message_id alone (see
      // resumes_message_only_key in 071), so at most one such row per
      // message regardless of how many times this window gets re-scanned.
      if (hasNotificationOnlyRow) continue;

      const { error: insertError } = await admin.from("resumes").insert({
        connection_user_id: connection.user_id,
        graph_message_id: message.id,
        graph_attachment_id: null,
        received_at: message.receivedDateTime,
        sender_name: senderName,
        sender_email: senderEmail,
        subject: message.subject ?? null,
        email_body_text: emailBodyText,
      });
      if (insertError) {
        console.error("syncResumeFolder: notification-only row insert failed", insertError);
        continue;
      }
      imported += 1;
      continue;
    }

    for (const attachment of attachments) {
      // Dedup key: (graph_message_id, graph_attachment_id) — a message can
      // carry more than one PDF, so the pair, not just the message id, is
      // the right granularity. Matches resumes_message_attachment_key.
      if (existingAttachmentIds.has(attachment.id)) continue;

      const bytes = Buffer.from(attachment.contentBytes, "base64");
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${connection.user_id}/${crypto.randomUUID()}-${safeName}`;

      // attachment.contentType is already normalized to exactly one of the
      // two supported values (see normalizeResumeContentType) — never a
      // generic/mislabeled type from the sender's mail client.
      const { error: uploadError } = await admin.storage
        .from("resumes")
        .upload(path, bytes, { contentType: attachment.contentType });
      if (uploadError) {
        console.error("syncResumeFolder: upload failed", uploadError);
        continue;
      }

      const { error: insertError } = await admin.from("resumes").insert({
        connection_user_id: connection.user_id,
        graph_message_id: message.id,
        graph_attachment_id: attachment.id,
        received_at: message.receivedDateTime,
        sender_name: senderName,
        sender_email: senderEmail,
        subject: message.subject ?? null,
        email_body_text: emailBodyText,
        file_name: attachment.name,
        storage_path: path,
        file_size_bytes: attachment.size,
        content_type: attachment.contentType,
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

  return { scanned: messages.length, imported, hitPageCap };
}
