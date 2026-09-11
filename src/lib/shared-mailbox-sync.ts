import { fetchSharedMailboxMessagesSince, htmlToPlainText } from "@/lib/microsoft-graph";
import {
  getSharedMailboxSettings,
  getValidSharedMailboxToken,
  clearSharedMailboxSyncError,
  recordSharedMailboxSyncError,
} from "@/lib/shared-mailbox";
import { sendPushToUser, sendPushToPermissionHolders } from "@/lib/push-notifications";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// First-run default when last_synced_at is null — after that, every sync is
// incremental from the previous one, same shape as the resume-folder sync's
// own lookback convention.
const DEFAULT_LOOKBACK_DAYS = 30;

export type SharedMailboxSyncResult = { scanned: number; matched: number; rsvps: number };

const RSVP_STATUS_BY_MEETING_MESSAGE_TYPE: Record<string, "accepted" | "declined" | "tentative"> = {
  meetingAccepted: "accepted",
  meetingDeclined: "declined",
  meetingTentativelyAccepted: "tentative",
};

/** Scans the shared mailbox for messages from a KNOWN candidate email (an
 * exact match against resumes.candidate_email/sender_email). A calendar
 * Accept/Decline/Tentative reply is recorded as that candidate's most
 * recently scheduled interview's RSVP status (Graph types these distinctly
 * via meetingMessageType, not just a plain message) rather than filed into
 * the Messages thread — everything else becomes an inbound resume_messages
 * row. Called by both the cron route and the manual "Sync now" action, so
 * there's exactly one sync implementation regardless of trigger. Any
 * failure (token mint, Graph request) is recorded on the settings row
 * rather than left to fail silently, since an unattended cron run has no
 * one watching it directly. */
export async function syncSharedMailboxMessages(admin: Admin): Promise<SharedMailboxSyncResult> {
  const settings = await getSharedMailboxSettings(admin);
  if (!settings?.mailboxEmail) {
    throw new Error(
      "The shared mailbox isn't configured yet — set SHARED_MAILBOX_EMAIL and finish setup under Settings → Integrations."
    );
  }

  try {
    const accessToken = await getValidSharedMailboxToken(admin, settings);

    const sinceIso =
      settings.lastSyncedAt ??
      new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const messages = await fetchSharedMailboxMessagesSince(accessToken, settings.mailboxEmail, sinceIso);

    // Every resume's known candidate email, lowercased — the match key for
    // filing an inbound message (or RSVP) against the right candidate.
    const { data: resumes } = await admin
      .from("resumes")
      .select("id, candidate_name, sender_name, candidate_email, sender_email");
    const resumeIdByEmail = new Map<string, string>();
    const resumeNameById = new Map<string, string>();
    for (const r of resumes ?? []) {
      const email = (r.candidate_email ?? r.sender_email)?.toLowerCase().trim();
      if (email && !resumeIdByEmail.has(email)) resumeIdByEmail.set(email, r.id);
      resumeNameById.set(r.id, r.candidate_name ?? r.sender_name ?? "A candidate");
    }

    // Each candidate's most recently scheduled interview — ascending order
    // means the last one seen per resume_id is the newest, which is what an
    // RSVP reply almost always refers to (a candidate rarely has more than
    // one active interview at a time). scheduled_by is who gets pushed an
    // RSVP notification — the clearest, least ambiguous recipient there is.
    const { data: interviews } = await admin
      .from("resume_interviews")
      .select("id, resume_id, created_at, scheduled_by")
      .order("created_at", { ascending: true });
    const latestInterviewIdByResumeId = new Map<string, string>();
    const scheduledByByResumeId = new Map<string, string | null>();
    for (const iv of interviews ?? []) {
      latestInterviewIdByResumeId.set(iv.resume_id, iv.id);
      scheduledByByResumeId.set(iv.resume_id, iv.scheduled_by);
    }

    let matched = 0;
    let rsvps = 0;
    for (const message of messages) {
      const fromEmail = message.from?.emailAddress?.address?.toLowerCase().trim();
      if (!fromEmail) continue;
      const resumeId = resumeIdByEmail.get(fromEmail);
      if (!resumeId) continue;

      const candidateName = resumeNameById.get(resumeId) ?? "A candidate";

      const rsvpStatus = message.meetingMessageType
        ? RSVP_STATUS_BY_MEETING_MESSAGE_TYPE[message.meetingMessageType]
        : undefined;
      if (rsvpStatus) {
        const interviewId = latestInterviewIdByResumeId.get(resumeId);
        if (interviewId) {
          await admin
            .from("resume_interviews")
            .update({ rsvp_status: rsvpStatus, rsvp_at: message.receivedDateTime })
            .eq("id", interviewId);
          rsvps += 1;

          const schedulerId = scheduledByByResumeId.get(resumeId);
          if (schedulerId) {
            sendPushToUser(admin, schedulerId, {
              title: "Interview RSVP",
              body: `${candidateName} ${rsvpStatus} the interview invite.`,
              url: "/recruitment",
            }).catch((err) => console.error("syncSharedMailboxMessages: RSVP push failed", err));
          }
        }
        continue;
      }

      const bodyText = message.body?.content
        ? message.body.contentType === "html"
          ? htmlToPlainText(message.body.content)
          : message.body.content
        : null;

      const { error } = await admin.from("resume_messages").upsert(
        {
          resume_id: resumeId,
          direction: "inbound",
          graph_message_id: message.id,
          subject: message.subject ?? null,
          body_text: bodyText,
          sent_at: message.receivedDateTime,
          from_email: fromEmail,
          to_email: settings.mailboxEmail,
        },
        { onConflict: "graph_message_id", ignoreDuplicates: true }
      );
      if (!error) {
        matched += 1;
        // No single owner for a plain reply (unlike an RSVP, which belongs
        // to whoever scheduled that interview) — the whole recruitment team
        // gets notified rather than guessing at one person.
        sendPushToPermissionHolders(admin, "manage_recruitment", {
          title: "Candidate reply",
          body: `${candidateName} replied.`,
          url: "/recruitment",
        }).catch((err) => console.error("syncSharedMailboxMessages: reply push failed", err));
      }
    }

    await admin
      .from("shared_mailbox_settings")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", true);
    await clearSharedMailboxSyncError(admin);

    return { scanned: messages.length, matched, rsvps };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shared mailbox sync failed.";
    await recordSharedMailboxSyncError(admin, message);
    throw err;
  }
}
