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
 * reachable POST endpoint regardless of what rendered it.
 *
 * `intent` is explicit rather than inferred from whether remarks is empty —
 * it used to be inferred, which meant a "Need to Discuss" submission with
 * an empty/whitespace-only note would silently get recorded as a plain
 * Acknowledge instead of failing loudly or discussing correctly. Now the UI
 * says exactly which button was pressed, and this only ever stores remarks
 * for the "discuss" intent. */
export async function acknowledgeReviewByTokenAction(
  token: string,
  intent: "acknowledge" | "discuss",
  remarks: string
): Promise<AckActionState> {
  const admin = createAdminClient();
  const review = await getQuarterlyReviewByAckToken(token, admin);
  if (!review) return { ok: false, message: "This link isn't valid." };
  if (review.alreadyAcknowledged) {
    return {
      ok: true,
      message: review.remarks
        ? "You already asked to discuss this review — thank you."
        : "This review was already acknowledged — thank you.",
    };
  }

  const wantsDiscussion = intent === "discuss";
  const trimmedRemarks = remarks.trim() || null;
  if (wantsDiscussion && !trimmedRemarks) {
    return { ok: false, message: "Add a note about what you'd like to discuss first." };
  }
  // A plain Acknowledge never carries remarks into storage, even if some
  // slipped through — only "discuss" ever populates client_ack_remarks.
  const storedRemarks = wantsDiscussion ? trimmedRemarks : null;

  // The is("client_acknowledged_at", null) guards a double-submit race —
  // only the first submit actually updates anything, so a second click (or
  // two tabs) can't fire the alert/email twice.
  const { data: updated } = await admin
    .from("quarterly_reviews")
    .update({ client_acknowledged_at: new Date().toISOString(), client_ack_remarks: storedRemarks })
    .eq("id", review.id)
    .is("client_acknowledged_at", null)
    .select("id")
    .maybeSingle();
  if (!updated) {
    return {
      ok: true,
      message: wantsDiscussion
        ? "You already asked to discuss this review — thank you."
        : "This review was already acknowledged — thank you.",
    };
  }

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
  revalidatePath("/quarterly-reviews");
  revalidatePath("/quarterly-reviews/all");
  return {
    ok: true,
    message: wantsDiscussion
      ? "Thank you — someone will contact you within a business day."
      : "Thank you for acknowledging this review.",
  };
}
