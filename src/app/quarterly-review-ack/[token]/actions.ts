"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { getQuarterlyReviewByAckToken, getQuarterlyReviewApproverEmail } from "@/lib/quarterly-review-data";
import { createAlert } from "@/lib/alerts";
import { sendPushToUser } from "@/lib/push-notifications";

export type AckActionState = { ok: boolean; message: string };

/** No auth at all — the random client_ack_token (110_quarterly_review_client_ack.sql)
 * is the only credential here, same trust model as a password-reset link.
 * Re-validates everything server-side rather than trusting the page that
 * rendered the form, since a Server Action is its own independently
 * reachable POST endpoint regardless of what rendered it.
 *
 * There's no "discuss" path anymore — that used to be a second button here
 * with its own remarks field, but a client discussing the review now just
 * replies to the email directly (see buildQuarterlyReviewClientEmail). This
 * is only ever a plain acknowledgment. */
export async function acknowledgeReviewByTokenAction(token: string): Promise<AckActionState> {
  const admin = createAdminClient();
  const review = await getQuarterlyReviewByAckToken(token, admin);
  if (!review) return { ok: false, message: "This link isn't valid." };
  if (review.alreadyAcknowledged) {
    return { ok: true, message: "This review was already acknowledged — thank you." };
  }

  // The is("client_acknowledged_at", null) guards a double-submit race —
  // only the first submit actually updates anything, so a second click (or
  // two tabs) can't fire the alert/push twice.
  const { data: updated } = await admin
    .from("quarterly_reviews")
    .update({ client_acknowledged_at: new Date().toISOString(), client_ack_remarks: null })
    .eq("id", review.id)
    .is("client_acknowledged_at", null)
    .select("id")
    .maybeSingle();
  if (!updated) {
    return { ok: true, message: "This review was already acknowledged — thank you." };
  }

  const approverEmail = await getQuarterlyReviewApproverEmail(admin);
  const { data: approverProfile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", approverEmail)
    .maybeSingle();

  const recipientIds = [review.createdById, approverProfile?.id];
  await createAlert(
    admin,
    recipientIds,
    "quarterly_review_client_acknowledged",
    `${review.clientName} acknowledged their review — ${review.reviewPeriod}`,
    null,
    `/quarterly-reviews/${review.id}`
  );
  for (const id of new Set(recipientIds.filter((id): id is string => Boolean(id)))) {
    sendPushToUser(admin, id, {
      title: "Client acknowledged their review",
      body: `${review.clientName} — ${review.reviewPeriod}`,
      url: `/quarterly-reviews/${review.id}`,
    }).catch((err) => console.error("acknowledgeReviewByTokenAction: push failed", err));
  }

  revalidatePath(`/quarterly-reviews/${review.id}`);
  revalidatePath("/quarterly-reviews");
  revalidatePath("/quarterly-reviews/all");
  return { ok: true, message: "Thank you for acknowledging this review." };
}
