"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getQuarterlyReviewByAckToken, QUARTERLY_REVIEW_APPROVER_EMAIL } from "@/lib/quarterly-review-data";
import { buildQuarterlyReviewDiscussionRequestedEmail } from "@/lib/resend";
import { sendMailAsSharedMailbox } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";
import { createAlert } from "@/lib/alerts";
import { sendPushToUser } from "@/lib/push-notifications";

export type AckActionState = { ok: boolean; message: string };

/** No auth at all — the random client_ack_token (110_quarterly_review_client_ack.sql)
 * is the only credential here, same trust model as a password-reset link.
 * Re-validates everything server-side rather than trusting the page that
 * rendered the form, since a Server Action is its own independently
 * reachable POST endpoint regardless of what rendered it. */
export async function acknowledgeReviewByTokenAction(token: string, remarks: string): Promise<AckActionState> {
  const admin = createAdminClient();
  const review = await getQuarterlyReviewByAckToken(token, admin);
  if (!review) return { ok: false, message: "This link isn't valid." };
  if (review.alreadyAcknowledged) {
    return { ok: true, message: "This review was already acknowledged — thank you." };
  }

  const trimmedRemarks = remarks.trim() || null;

  // The is("client_acknowledged_at", null) guards a double-submit race —
  // only the first submit actually updates anything, so a second click (or
  // two tabs) can't fire the alert/email twice.
  const { data: updated } = await admin
    .from("quarterly_reviews")
    .update({ client_acknowledged_at: new Date().toISOString(), client_ack_remarks: trimmedRemarks })
    .eq("id", review.id)
    .is("client_acknowledged_at", null)
    .select("id")
    .maybeSingle();
  if (!updated) {
    return { ok: true, message: "This review was already acknowledged — thank you." };
  }

  // The client's choice of button is exactly this: "Acknowledge" always
  // submits with empty remarks, "Need to Discuss" won't submit without
  // some text. So remarks presence alone tells us which one they picked —
  // no separate flag needed. Per how this was asked for: a plain
  // acknowledgment only needs the in-app alert; a discussion request also
  // gets a real email, since that one wants an actual response.
  const wantsDiscussion = Boolean(trimmedRemarks);

  const { data: approverProfile } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", QUARTERLY_REVIEW_APPROVER_EMAIL)
    .maybeSingle();
  const { data: creatorProfile } = review.createdById
    ? await admin.from("profiles").select("email").eq("id", review.createdById).maybeSingle()
    : { data: null };

  const recipientIds = [review.createdById, approverProfile?.id];
  await createAlert(
    admin,
    recipientIds,
    wantsDiscussion ? "quarterly_review_client_discussion_requested" : "quarterly_review_client_acknowledged",
    wantsDiscussion
      ? `${review.clientName} wants to discuss their review — ${review.reviewPeriod}`
      : `${review.clientName} acknowledged their review — ${review.reviewPeriod}`,
    trimmedRemarks,
    `/quarterly-reviews/${review.id}`
  );
  for (const id of new Set(recipientIds.filter((id): id is string => Boolean(id)))) {
    sendPushToUser(admin, id, {
      title: wantsDiscussion ? "Client wants to discuss their review" : "Client acknowledged their review",
      body: `${review.clientName} — ${review.reviewPeriod}`,
      url: `/quarterly-reviews/${review.id}`,
    }).catch((err) => console.error("acknowledgeReviewByTokenAction: push failed", err));
  }

  if (wantsDiscussion && trimmedRemarks) {
    try {
      const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
      const settings = mailboxEmail ? await getSharedMailboxSettings(admin) : null;
      if (mailboxEmail && settings) {
        const accessToken = await getValidSharedMailboxToken(admin, settings);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        const { html, text } = buildQuarterlyReviewDiscussionRequestedEmail(
          review.clientName,
          review.reviewPeriod,
          trimmedRemarks,
          `${appUrl}/quarterly-reviews/${review.id}`
        );
        const emailRecipients = new Set<string>([QUARTERLY_REVIEW_APPROVER_EMAIL]);
        if (creatorProfile?.email) emailRecipients.add(creatorProfile.email);

        await Promise.all(
          [...emailRecipients].map((to) =>
            sendMailAsSharedMailbox(accessToken, mailboxEmail, {
              to,
              subject: `Client wants to discuss: ${review.clientName} — ${review.reviewPeriod}`,
              html,
              text,
            })
          )
        );
      }
    } catch (err) {
      console.error("acknowledgeReviewByTokenAction: notify email failed", err);
    }
  }

  revalidatePath(`/quarterly-reviews/${review.id}`);
  return {
    ok: true,
    message: wantsDiscussion
      ? "Thank you — we'll follow up with you about this."
      : "Thank you — your acknowledgment has been recorded.",
  };
}
