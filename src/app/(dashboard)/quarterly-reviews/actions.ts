"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requirePermission, getMyPermissions, hasPermission } from "@/lib/permissions";
import type { QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";
import {
  createQuarterlyReview,
  getQuarterlyReview,
  fetchReviewAttachments,
  fetchPreviousReviewSnapshot,
  QUARTERLY_REVIEW_ATTACHMENTS_BUCKET,
  QUARTERLY_REVIEW_PDF_BUCKET,
  QUARTERLY_REVIEW_APPROVER_EMAIL,
} from "@/lib/quarterly-review-data";
import { generateQuarterlyReviewSummary } from "@/lib/quarterly-review-analysis";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { buildQuarterlyReviewPdf } from "@/lib/quarterly-review-pdf";
import { buildQuarterlyReviewClientEmail } from "@/lib/resend";
import type { SharedMailboxAttachment } from "@/lib/microsoft-graph";
import { sendMailAsSharedMailbox } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";
import { createAlert } from "@/lib/alerts";
import { sendPushToUser } from "@/lib/push-notifications";

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
 * exact account sees the Approve button at all. Kept as a local alias so
 * every existing reference below doesn't need renaming — the actual value
 * lives in quarterly-review-data.ts (QUARTERLY_REVIEW_APPROVER_EMAIL), the
 * single source of truth shared with [id]/page.tsx and the public
 * acknowledgment action. */
const APPROVER_EMAIL = QUARTERLY_REVIEW_APPROVER_EMAIL;

/** Same idea as isReviewEditable, but the Summary specifically stays
 * editable for the approver even while a review is "submitted" and
 * awaiting their decision — so they can tighten the client-facing wording
 * (or regenerate it with AI) while reviewing it, without first sending it
 * back to draft just to touch the summary. */
async function canEditSummary(
  reviewId: string,
  admin: ReturnType<typeof createAdminClient>,
  userEmail: string | null | undefined
): Promise<boolean> {
  const { data } = await admin.from("quarterly_reviews").select("status").eq("id", reviewId).maybeSingle();
  if (data?.status === "draft") return true;
  return data?.status === "submitted" && (userEmail ?? "").toLowerCase() === APPROVER_EMAIL.toLowerCase();
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
  if (!(await canEditSummary(reviewId, admin, user.email))) return;

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

/** Which Autotask ticket (if any) this review relates to — same
 * always-editable, internal-only posture as the hours field above. */
export async function saveQuarterlyReviewTicketNumberAction(reviewId: string, ticketNumber: string | null): Promise<void> {
  if (!(await requirePermission("manage_quarterly_reviews"))) return;

  const admin = createAdminClient();
  await admin.from("quarterly_reviews").update({ ticket_number: ticketNumber }).eq("id", reviewId);
  revalidatePath(`/quarterly-reviews/${reviewId}`);
}

/** Best-effort AI draft of the client-facing summary — analyzes the
 * current checklist results and overwrites the summary field. Staff can
 * edit the result afterward same as if they'd typed it themselves. */
export async function generateQuarterlyReviewSummaryAction(reviewId: string): Promise<ReviewActionState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { ok: false, message: "You don't have permission to do that." };

  const admin = createAdminClient();
  if (!(await canEditSummary(reviewId, admin, user.email))) {
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

/** Gated by its own permission (delete_quarterly_reviews), not just role —
 * an Owner always has it implicitly (hasPermission short-circuits every
 * permission for that role), and anyone else can be granted it from Team →
 * Roles & permissions, same as delete_tasks is split out from general task
 * management. No status restriction at all, unlike everything else on this
 * page: deletable in any state, including "sent". The client already has
 * their own copy via email regardless, so this only removes CG Ops's own
 * record, its screenshots, and the stored PDF. Items and attachments rows
 * cascade-delete with the review (102/103's `on delete cascade`); the
 * actual storage objects don't, so those are removed here explicitly
 * first. */
export async function deleteQuarterlyReviewAction(reviewId: string): Promise<void> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, "delete_quarterly_reviews"))) return;

  const admin = createAdminClient();
  const review = await getQuarterlyReview(reviewId, admin);
  if (!review) redirect("/quarterly-reviews");

  const attachments = await fetchReviewAttachments(reviewId, admin);
  if (attachments.length > 0) {
    await admin.storage.from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET).remove(attachments.map((a) => a.storagePath));
  }
  if (review.pdfStoragePath) {
    await admin.storage.from(QUARTERLY_REVIEW_PDF_BUCKET).remove([review.pdfStoragePath]);
  }

  await admin.from("quarterly_reviews").delete().eq("id", reviewId);

  revalidatePath("/quarterly-reviews");
  revalidatePath("/quarterly-reviews/all");
  revalidatePath(`/clients/${review.clientId}`);
  redirect("/quarterly-reviews");
}

export type ReviewActionState = { ok: boolean; message: string };

/** Submits the draft for approval — alerts the approver (not the creator)
 * that a review is waiting, on the Overview page, rather than an
 * immediate email (see src/lib/alerts.ts). */
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

  const [{ data: profile }, { data: approverProfile }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    // Case-insensitive on purpose — every other APPROVER_EMAIL comparison
    // in this file lowercases both sides in JS before comparing; a raw
    // .eq() here would silently match nothing (and silently skip creating
    // the alert) if the stored email's casing differs at all.
    admin.from("profiles").select("id").ilike("email", APPROVER_EMAIL).maybeSingle(),
  ]);
  await createAlert(
    admin,
    [approverProfile?.id],
    "quarterly_review_submitted",
    `Review awaiting approval: ${review.clientName} — ${review.reviewPeriod}`,
    `Submitted by ${profile?.full_name ?? "someone"}`,
    `/quarterly-reviews/${reviewId}`
  );
  if (approverProfile?.id) {
    sendPushToUser(admin, approverProfile.id, {
      title: "Review awaiting approval",
      body: `${review.clientName} — ${review.reviewPeriod}`,
      url: `/quarterly-reviews/${reviewId}`,
    }).catch((err) => console.error("submitQuarterlyReviewAction: push failed", err));
  }

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  return { ok: true, message: "Submitted for review." };
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
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      // Closes out any earlier round of requested changes — this is now a
      // clean approval, not a reflection of stale feedback.
      adjustment_notes: null,
      adjustment_requested_at: null,
      adjustment_requested_by: null,
    })
    .eq("id", reviewId);

  await createAlert(
    admin,
    [review.createdById],
    "quarterly_review_approved",
    `Approved: ${review.clientName} — ${review.reviewPeriod}`,
    "Ready to send to the client.",
    `/quarterly-reviews/${reviewId}`
  );
  if (review.createdById) {
    sendPushToUser(admin, review.createdById, {
      title: "Review approved",
      body: `${review.clientName} — ${review.reviewPeriod}`,
      url: `/quarterly-reviews/${reviewId}`,
    }).catch((err) => console.error("approveQuarterlyReviewAction: push failed", err));
  }

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  return { ok: true, message: "Approved." };
}

/** The approver's other option besides Approve — sends a submitted review
 * back to draft with their remarks attached, so the creator sees exactly
 * what to fix (shown as a "Needs Adjustment" section on the review page)
 * instead of just being told to redo it with no explanation. Gated the
 * same way approveQuarterlyReviewAction is. */
export async function requestQuarterlyReviewAdjustmentAction(reviewId: string, notes: string): Promise<ReviewActionState> {
  const user = await requirePermission("manage_quarterly_reviews");
  if (!user) return { ok: false, message: "You don't have permission to do that." };
  if ((user.email ?? "").toLowerCase() !== APPROVER_EMAIL.toLowerCase()) {
    return { ok: false, message: "Only the approver can request changes." };
  }

  const trimmedNotes = notes.trim();
  if (!trimmedNotes) return { ok: false, message: "Add a note about what needs adjusting." };

  const admin = createAdminClient();
  const review = await getQuarterlyReview(reviewId, admin);
  if (!review) return { ok: false, message: "Review not found." };
  if (review.status !== "submitted") {
    return { ok: false, message: "This review isn't awaiting approval." };
  }

  await admin
    .from("quarterly_reviews")
    .update({
      status: "draft",
      adjustment_notes: trimmedNotes,
      adjustment_requested_at: new Date().toISOString(),
      adjustment_requested_by: user.id,
    })
    .eq("id", reviewId);

  await createAlert(
    admin,
    [review.createdById],
    "quarterly_review_adjustment_requested",
    `Changes requested: ${review.clientName} — ${review.reviewPeriod}`,
    trimmedNotes,
    `/quarterly-reviews/${reviewId}`
  );
  if (review.createdById) {
    sendPushToUser(admin, review.createdById, {
      title: "Changes requested on a review",
      body: `${review.clientName} — ${review.reviewPeriod}`,
      url: `/quarterly-reviews/${reviewId}`,
    }).catch((err) => console.error("requestQuarterlyReviewAdjustmentAction: push failed", err));
  }

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  revalidatePath("/quarterly-reviews");
  return { ok: true, message: "Sent back for adjustments." };
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

  // Declared here (not inside the try block below) so the final status
  // update after it can still read them — a block-scoped const/let inside
  // a try {} isn't visible once that block ends.
  const pdfStoragePath = `${reviewId}.pdf`;
  let pdfPersisted = false;
  // Regenerated on every send — invalidates any link from a previous round
  // (see 110_quarterly_review_client_ack.sql) and resets the acknowledgment
  // fields below so an earlier round's acknowledgment can't be mistaken for
  // this one.
  const ackToken = crypto.randomUUID();
  const ackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/quarterly-review-ack/${ackToken}`;

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

    // Only for the "Changes Since Last Review" section — status
    // transitions, not the old comments, so this stays a plain "what
    // changed" note rather than carrying over internal detail.
    const previousReview = await fetchPreviousReviewSnapshot(review.clientId, reviewId, admin);
    const previousItems = previousReview
      ? new Map([...previousReview.itemsByKey.entries()].map(([key, row]) => [key, row.status]))
      : null;

    const { pdf, embeddedImageIds } = buildQuarterlyReviewPdf({
      clientName: review.clientName,
      reviewPeriod: review.reviewPeriod,
      summary: review.summary,
      items: review.items.map((i) => ({ itemKey: i.itemKey, status: i.status, comments: i.comments })),
      images: images.map((i) => ({ id: i.id, buffer: i.buffer, label: i.label, fileName: i.fileName })),
      previousItems,
    });

    // Keeps the exact sent PDF around so it can be opened/downloaded again
    // later — from the client's own record (any staff who can view
    // clients, not just manage_quarterly_reviews holders) and from the
    // client's own portal login. Best-effort: a storage hiccup shouldn't
    // block the actual send, which is the part the client is waiting on.
    try {
      const { error: pdfUploadError } = await admin.storage
        .from(QUARTERLY_REVIEW_PDF_BUCKET)
        .upload(pdfStoragePath, pdf, { contentType: "application/pdf", upsert: true });
      pdfPersisted = !pdfUploadError;
      if (pdfUploadError) console.error("sendQuarterlyReviewToClientAction: PDF upload failed", pdfUploadError);
    } catch (uploadErr) {
      console.error("sendQuarterlyReviewToClientAction: PDF upload threw", uploadErr);
    }

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

    const { html, text } = buildQuarterlyReviewClientEmail(review.clientName, review.reviewPeriod, review.summary, ackUrl);
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
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_to_email: trimmedEmail,
      sent_by: user.id,
      client_ack_token: ackToken,
      client_acknowledged_at: null,
      client_ack_remarks: null,
      ...(pdfPersisted ? { pdf_storage_path: pdfStoragePath } : {}),
    })
    .eq("id", reviewId);

  revalidatePath(`/quarterly-reviews/${reviewId}`);
  revalidatePath(`/clients/${review.clientId}`);
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

/** A pasted screenshot starts with no caption at all (there's no dialog to
 * fill one in mid-paste) — this lets that comment be added or edited
 * afterward, directly on the thumbnail, same as an uploaded one's caption
 * could already be set at upload time. */
export async function updateQuarterlyReviewAttachmentLabelAction(
  attachmentId: string,
  reviewId: string,
  label: string | null
): Promise<void> {
  if (!(await requirePermission("manage_quarterly_reviews"))) return;

  const admin = createAdminClient();
  if (!(await isReviewEditable(reviewId, admin))) return;

  await admin.from("quarterly_review_attachments").update({ label }).eq("id", attachmentId);
  revalidatePath(`/quarterly-reviews/${reviewId}`);
}
