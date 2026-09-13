"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import type { QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";
import { createQuarterlyReview, getQuarterlyReview } from "@/lib/quarterly-review-data";
import {
  buildQuarterlyReviewSubmittedEmail,
  buildQuarterlyReviewApprovedEmail,
  buildQuarterlyReviewClientEmail,
} from "@/lib/resend";
import { sendMailAsSharedMailbox } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";

/** The one person who can approve a submitted review — a specific named
 * approver, not a permission, per how this workflow was asked for. Anyone
 * else with manage_quarterly_reviews can create/submit reviews; only this
 * exact account sees the Approve button at all. */
const APPROVER_EMAIL = "ilotay@cgtechnologies.com";

function reviewUrl(reviewId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${appUrl}/quarterly-reviews/${reviewId}`;
}

export async function createQuarterlyReviewAction(clientId: string, reviewPeriod: string): Promise<void> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return;

  const trimmedPeriod = reviewPeriod.trim();
  if (!clientId || !trimmedPeriod) return;

  const admin = createAdminClient();
  const reviewId = await createQuarterlyReview(clientId, trimmedPeriod, user.id, admin);
  redirect(`/quarterly-reviews/${reviewId}`);
}

export async function saveQuarterlyReviewItemAction(
  reviewId: string,
  itemKey: string,
  status: QuarterlyReviewItemStatus,
  comments: string | null
): Promise<void> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("quarterly_review_items").upsert(
    { review_id: reviewId, item_key: itemKey, status, comments, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "review_id,item_key" }
  );
  revalidatePath(`/quarterly-reviews/${reviewId}`);
}

export type ReviewActionState = { ok: boolean; message: string };

/** Submits the draft for approval — emails the approver (not the creator)
 * that a review is waiting. Best-effort on the email: a misconfigured
 * mailbox shouldn't block moving the review to "submitted". */
export async function submitQuarterlyReviewAction(reviewId: string): Promise<ReviewActionState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { ok: false, message: "You don't have permission to do that." };

  const admin = createAdminClient();
  const review = await getQuarterlyReview(reviewId, admin);
  if (!review) return { ok: false, message: "Review not found." };

  await admin
    .from("quarterly_reviews")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", reviewId);

  let emailNote = "";
  try {
    const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
    const settings = mailboxEmail ? await getSharedMailboxSettings(admin) : null;
    if (!mailboxEmail || !settings) {
      emailNote = " (Shared mailbox isn't configured, so no notification was sent.)";
    } else {
      const accessToken = await getValidSharedMailboxToken(admin, settings);
      const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      const { html, text } = buildQuarterlyReviewSubmittedEmail(
        review.clientName,
        review.reviewPeriod,
        profile?.full_name ?? "Someone",
        reviewUrl(reviewId)
      );
      await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
        to: APPROVER_EMAIL,
        subject: `Review waiting: ${review.clientName} — ${review.reviewPeriod}`,
        html,
        text,
      });
      emailNote = ` Notified ${APPROVER_EMAIL}.`;
    }
  } catch (err) {
    console.error("submitQuarterlyReviewAction: notify failed", err);
    emailNote = " (Notifying the approver failed — check the shared mailbox settings.)";
  }

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  return { ok: true, message: `Submitted for review.${emailNote}` };
}

/** Gated by the specific approver's own email, not a permission — anyone
 * else calling this (even with manage_quarterly_reviews) gets refused. */
export async function approveQuarterlyReviewAction(reviewId: string): Promise<ReviewActionState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { ok: false, message: "You don't have permission to do that." };
  if ((user.email ?? "").toLowerCase() !== APPROVER_EMAIL.toLowerCase()) {
    return { ok: false, message: "Only the approver can approve a review." };
  }

  const admin = createAdminClient();
  const review = await getQuarterlyReview(reviewId, admin);
  if (!review) return { ok: false, message: "Review not found." };

  await admin
    .from("quarterly_reviews")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user.id })
    .eq("id", reviewId);

  let emailNote = "";
  try {
    const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
    const settings = mailboxEmail ? await getSharedMailboxSettings(admin) : null;
    if (!mailboxEmail || !settings || !review.createdByEmail) {
      emailNote = " (Couldn't notify the creator — shared mailbox or their email isn't available.)";
    } else {
      const accessToken = await getValidSharedMailboxToken(admin, settings);
      const { html, text } = buildQuarterlyReviewApprovedEmail(review.clientName, review.reviewPeriod, reviewUrl(reviewId));
      await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
        to: review.createdByEmail,
        subject: `Approved: ${review.clientName} — ${review.reviewPeriod}`,
        html,
        text,
      });
      emailNote = ` Notified ${review.createdByEmail}.`;
    }
  } catch (err) {
    console.error("approveQuarterlyReviewAction: notify failed", err);
    emailNote = " (Notifying the creator failed — check the shared mailbox settings.)";
  }

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  return { ok: true, message: `Approved.${emailNote}` };
}

/** Only reachable once a review is "approved" — enforced here too, not
 * just by hiding the button, since this is a Server Action any signed-in
 * staff member could otherwise call directly. testEmail is a manually-typed
 * address for now (see the page's own note) rather than a looked-up client
 * contact, since this is explicitly being tried out before wiring to a real
 * contact. */
export async function sendQuarterlyReviewToClientAction(reviewId: string, testEmail: string): Promise<ReviewActionState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { ok: false, message: "You don't have permission to do that." };

  const trimmedEmail = testEmail.trim();
  if (!trimmedEmail) return { ok: false, message: "Enter an email address to send to." };

  const admin = createAdminClient();
  const review = await getQuarterlyReview(reviewId, admin);
  if (!review) return { ok: false, message: "Review not found." };
  if (review.status !== "approved") {
    return { ok: false, message: "This review hasn't been approved yet." };
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) return { ok: false, message: "The shared mailbox isn't configured." };
  const settings = await getSharedMailboxSettings(admin);
  if (!settings) return { ok: false, message: "The shared mailbox integration isn't set up yet." };

  try {
    const accessToken = await getValidSharedMailboxToken(admin, settings);
    const itemsByKey = new Map(review.items.map((i) => [i.itemKey, { status: i.status, comments: i.comments }]));
    const { html, text } = buildQuarterlyReviewClientEmail(review.clientName, review.reviewPeriod, itemsByKey);
    await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
      to: trimmedEmail,
      subject: `Quarterly Systems Review — ${review.reviewPeriod} — ${review.clientName}`,
      html,
      text,
    });
  } catch (err) {
    console.error("sendQuarterlyReviewToClientAction: send failed", err);
    return { ok: false, message: "Sending failed — check the shared mailbox settings." };
  }

  await admin
    .from("quarterly_reviews")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_to_email: trimmedEmail })
    .eq("id", reviewId);

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  return { ok: true, message: `Sent to ${trimmedEmail}.` };
}
