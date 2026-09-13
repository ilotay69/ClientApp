"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import type { QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";
import {
  createQuarterlyReview,
  getQuarterlyReview,
  fetchReviewAttachments,
  QUARTERLY_REVIEW_ATTACHMENTS_BUCKET,
} from "@/lib/quarterly-review-data";
import {
  buildQuarterlyReviewSubmittedEmail,
  buildQuarterlyReviewApprovedEmail,
  buildQuarterlyReviewClientEmail,
  type QuarterlyReviewEmailScreenshot,
} from "@/lib/resend";
import type { SharedMailboxAttachment } from "@/lib/microsoft-graph";
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

    // Screenshots are embedded inline in the email body (cid: reference),
    // not just attached — matches how the original document shows them
    // directly in its own appendix rather than as separate files to open.
    const attachments = await fetchReviewAttachments(reviewId, admin);
    const screenshots: QuarterlyReviewEmailScreenshot[] = [];
    const graphAttachments: SharedMailboxAttachment[] = [];
    for (const a of attachments) {
      try {
        const { data: blob, error: downloadError } = await admin.storage
          .from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET)
          .download(a.storagePath);
        if (downloadError || !blob) continue;
        const contentBase64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        graphAttachments.push({
          filename: a.fileName,
          contentBase64,
          contentType: a.contentType || "image/png",
          contentId: a.id,
          isInline: true,
        });
        screenshots.push({ contentId: a.id, label: a.label, fileName: a.fileName });
      } catch (attachErr) {
        console.error("sendQuarterlyReviewToClientAction: attachment fetch failed", a.id, attachErr);
      }
    }

    const { html, text } = buildQuarterlyReviewClientEmail(
      review.clientName,
      review.reviewPeriod,
      itemsByKey,
      screenshots
    );
    await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
      to: trimmedEmail,
      subject: `Quarterly Systems Review — ${review.reviewPeriod} — ${review.clientName}`,
      html,
      text,
      attachments: graphAttachments,
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

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB — a screenshot, not a document
const ACCEPTED_ATTACHMENT_TYPES: Record<string, true> = {
  "image/png": true,
  "image/jpeg": true,
  "image/gif": true,
  "image/webp": true,
};

export type UploadAttachmentState = { error: string | null };

/** Same upload-then-rollback-on-DB-failure shape as the resume file
 * upload — path is `${reviewId}/${uuid}-${safeName}` in the
 * quarterly-review-attachments bucket (private, staff-only RLS). */
export async function uploadQuarterlyReviewAttachmentAction(
  reviewId: string,
  _prevState: UploadAttachmentState,
  formData: FormData
): Promise<UploadAttachmentState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { error: "You don't have permission to do that." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image first." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "That image is larger than 10MB." };
  }
  const extMatch = /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  if (!ACCEPTED_ATTACHMENT_TYPES[file.type] && !extMatch) {
    return { error: "Only PNG, JPG, GIF, or WEBP images are supported." };
  }

  const label = String(formData.get("label") ?? "").trim() || null;
  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${reviewId}/${crypto.randomUUID()}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET)
    .upload(path, bytes, { contentType: file.type || "image/png" });
  if (uploadError) {
    console.error("uploadQuarterlyReviewAttachmentAction: upload failed", uploadError);
    return { error: "Couldn't upload that image." };
  }

  const { error: insertError } = await admin.from("quarterly_review_attachments").insert({
    review_id: reviewId,
    storage_path: path,
    file_name: file.name,
    file_size_bytes: file.size,
    content_type: file.type || null,
    label,
    created_by: user.id,
  });
  if (insertError) {
    console.error("uploadQuarterlyReviewAttachmentAction: insert failed", insertError);
    await admin.storage.from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET).remove([path]);
    return { error: "Couldn't save that image." };
  }

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  return { error: null };
}

export async function deleteQuarterlyReviewAttachmentAction(attachmentId: string, reviewId: string): Promise<void> {
  if (!(await requirePermission("manage_quarterly_reviews"))) return;

  const admin = createAdminClient();
  const { data: attachment } = await admin
    .from("quarterly_review_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!attachment) return;

  await admin.from("quarterly_review_attachments").delete().eq("id", attachmentId);
  await admin.storage.from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET).remove([attachment.storage_path]);
  revalidatePath(`/quarterly-reviews/${reviewId}`);
}
