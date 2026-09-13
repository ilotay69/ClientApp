"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requirePermission, getMyPermissions } from "@/lib/permissions";
import type { QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";
import {
  createQuarterlyReview,
  getQuarterlyReview,
  fetchReviewAttachments,
  QUARTERLY_REVIEW_ATTACHMENTS_BUCKET,
} from "@/lib/quarterly-review-data";
import { generateQuarterlyReviewSummary } from "@/lib/quarterly-review-analysis";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { buildQuarterlyReviewPdf } from "@/lib/quarterly-review-pdf";
import {
  buildQuarterlyReviewSubmittedEmail,
  buildQuarterlyReviewApprovedEmail,
  buildQuarterlyReviewClientEmail,
} from "@/lib/resend";
import type { SharedMailboxAttachment } from "@/lib/microsoft-graph";
import { sendMailAsSharedMailbox } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";

/** Whether a review's checklist/summary/screenshots can still be edited —
 * only while "draft". An Owner reopening a sent/approved/submitted review
 * (reopenQuarterlyReviewAction) is the only way back to this state.
 * Checked server-side in every edit action, not just by the UI hiding the
 * controls, since this is a real access boundary once a review has gone to
 * the client. */
async function isReviewEditable(reviewId: string, admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await admin.from("quarterly_reviews").select("status").eq("id", reviewId).maybeSingle();
  return data?.status === "draft";
}

/** The one person who can approve a submitted review — a specific named
 * approver, not a permission, per how this workflow was asked for. Anyone
 * else with manage_quarterly_reviews can create/submit reviews; only this
 * exact account sees the Approve button at all. */
const APPROVER_EMAIL = "ilotay@cgtechnologies.com";

function reviewUrl(reviewId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${appUrl}/quarterly-reviews/${reviewId}`;
}

export type CreateReviewState = { error: string } | undefined;

/** confirmDuplicate lets the form re-submit past the warning once the user
 * has actually seen it and decided to proceed anyway — the check itself is
 * server-side (an exact match on client_id + review_period), not just a
 * client-side guess, since the month/year dropdowns guarantee a consistent
 * format but two people could still race to create the same one. */
export async function createQuarterlyReviewAction(
  clientId: string,
  reviewPeriod: string,
  confirmDuplicate: boolean
): Promise<CreateReviewState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { error: "You don't have permission to do that." };

  const trimmedPeriod = reviewPeriod.trim();
  if (!clientId || !trimmedPeriod) return { error: "Choose a client, month, and year." };

  const admin = createAdminClient();

  if (!confirmDuplicate) {
    const { data: existing } = await admin
      .from("quarterly_reviews")
      .select("id")
      .eq("client_id", clientId)
      .eq("review_period", trimmedPeriod)
      .maybeSingle();
    if (existing) {
      return { error: `A review for ${trimmedPeriod} already exists for this client.` };
    }
  }

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
  if (!(await isReviewEditable(reviewId, admin))) return;

  await admin.from("quarterly_review_items").upsert(
    { review_id: reviewId, item_key: itemKey, status, comments, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "review_id,item_key" }
  );
  revalidatePath(`/quarterly-reviews/${reviewId}`);
}

/** Client-facing, editable — starts as an AI draft (see
 * generateQuarterlyReviewSummaryAction), staff can rewrite it freely.
 * Locked the same as checklist items once the review leaves draft. */
export async function saveQuarterlyReviewSummaryAction(reviewId: string, summary: string | null): Promise<void> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return;

  const admin = createAdminClient();
  if (!(await isReviewEditable(reviewId, admin))) return;

  await admin.from("quarterly_reviews").update({ summary }).eq("id", reviewId);
  revalidatePath(`/quarterly-reviews/${reviewId}`);
}

/** Internal-only time tracking — deliberately NOT gated by
 * isReviewEditable, unlike everything else on the review: a completed
 * review's logged hours can still legitimately change after it's sent
 * (e.g. wrap-up time), and this never reaches the client either way. Shown
 * on both the review page and the reviews list. */
export async function saveQuarterlyReviewHoursAction(reviewId: string, hours: number | null): Promise<void> {
  if (!(await requirePermission("manage_quarterly_reviews"))) return;

  const admin = createAdminClient();
  await admin.from("quarterly_reviews").update({ hours_spent: hours }).eq("id", reviewId);
  revalidatePath(`/quarterly-reviews/${reviewId}`);
  revalidatePath("/quarterly-reviews");
}

/** Best-effort AI draft of the client-facing summary — analyzes the
 * current checklist results and overwrites the summary field. Staff can
 * edit the result afterward same as if they'd typed it themselves. */
export async function generateQuarterlyReviewSummaryAction(reviewId: string): Promise<ReviewActionState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { ok: false, message: "You don't have permission to do that." };

  const admin = createAdminClient();
  if (!(await isReviewEditable(reviewId, admin))) {
    return { ok: false, message: "This review is locked — an Owner needs to reopen it first." };
  }

  const review = await getQuarterlyReview(reviewId, admin);
  if (!review) return { ok: false, message: "Review not found." };

  const settings = await getActiveAiSettings(admin);
  if (!settings) return { ok: false, message: "No AI provider is configured (Settings → Integrations)." };

  try {
    const summary = await generateQuarterlyReviewSummary(
      review.clientName,
      review.reviewPeriod,
      review.items.map((i) => ({ itemKey: i.itemKey, status: i.status, comments: i.comments })),
      settings
    );
    if (!summary) return { ok: false, message: "Couldn't generate a summary — try again." };

    await admin.from("quarterly_reviews").update({ summary }).eq("id", reviewId);
    revalidatePath(`/quarterly-reviews/${reviewId}`);
    return { ok: true, message: "Summary generated." };
  } catch (err) {
    console.error("generateQuarterlyReviewSummaryAction failed", err);
    return { ok: false, message: "Generating a summary failed." };
  }
}

/** Owner OR the named approver — checked by role/email, not by the
 * manage_quarterly_reviews permission. Anyone with that permission can
 * create/submit/work a review, but reopening a submitted/approved/sent one
 * back to draft (e.g. a mistake was found after sending, and it needs
 * fixing and resending) is deliberately restricted further, to the same
 * two people who can approve or who own the account. */
export async function reopenQuarterlyReviewAction(reviewId: string): Promise<ReviewActionState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { ok: false, message: "You don't have permission to do that." };

  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  const isApprover = (user.email ?? "").toLowerCase() === APPROVER_EMAIL.toLowerCase();
  if (me?.role !== "owner" && !isApprover) {
    return { ok: false, message: "Only an Owner or the approver can reopen a review." };
  }

  const admin = createAdminClient();
  await admin.from("quarterly_reviews").update({ status: "draft" }).eq("id", reviewId);
  revalidatePath(`/quarterly-reviews/${reviewId}`);
  revalidatePath("/quarterly-reviews");
  return { ok: true, message: "Reopened for editing." };
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
    .update({ status: "submitted", submitted_at: new Date().toISOString(), submitted_by: user.id })
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

    // The checklist/comments/screenshots now live in an attached PDF rather
    // than the email body — download each screenshot once, try to embed it
    // in the PDF (PNG/JPEG only), and fall back to attaching the original
    // file directly for anything that couldn't be embedded (GIF/WEBP) so
    // nothing the reviewer added gets silently dropped.
    const attachments = await fetchReviewAttachments(reviewId, admin);
    const images: { id: string; buffer: Buffer; label: string | null; fileName: string; contentType: string }[] = [];
    for (const a of attachments) {
      try {
        const { data: blob, error: downloadError } = await admin.storage
          .from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET)
          .download(a.storagePath);
        if (downloadError || !blob) continue;
        images.push({
          id: a.id,
          buffer: Buffer.from(await blob.arrayBuffer()),
          label: a.label,
          fileName: a.fileName,
          contentType: a.contentType || "image/png",
        });
      } catch (attachErr) {
        console.error("sendQuarterlyReviewToClientAction: attachment fetch failed", a.id, attachErr);
      }
    }

    const { pdf, embeddedImageIds } = buildQuarterlyReviewPdf({
      clientName: review.clientName,
      reviewPeriod: review.reviewPeriod,
      summary: review.summary,
      items: review.items.map((i) => ({ itemKey: i.itemKey, status: i.status, comments: i.comments })),
      images: images.map((i) => ({ id: i.id, buffer: i.buffer, label: i.label, fileName: i.fileName })),
    });

    const graphAttachments: SharedMailboxAttachment[] = [
      {
        filename: `${review.clientName} Quarterly Review - ${review.reviewPeriod}.pdf`,
        contentBase64: pdf.toString("base64"),
        contentType: "application/pdf",
        isInline: false,
      },
    ];
    for (const image of images) {
      if (!embeddedImageIds.has(image.id)) {
        graphAttachments.push({
          filename: image.fileName,
          contentBase64: image.buffer.toString("base64"),
          contentType: image.contentType,
          isInline: false,
        });
      }
    }

    const { html, text } = buildQuarterlyReviewClientEmail(review.clientName, review.reviewPeriod, review.summary);
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
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_to_email: trimmedEmail, sent_by: user.id })
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
  if (!(await isReviewEditable(reviewId, admin))) {
    return { error: "This review is locked — an Owner needs to reopen it first." };
  }
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
  if (!(await isReviewEditable(reviewId, admin))) return;

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
