import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getQuarterlyReviewReminderSettings,
  QUARTERLY_REVIEW_PDF_BUCKET,
} from "@/lib/quarterly-review-data";
import { buildQuarterlyReviewClientEmail } from "@/lib/resend";
import { sendMailAsSharedMailbox, type SharedMailboxAttachment } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";

export const dynamic = "force-dynamic";

const ORDINAL_WORDS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
function ordinalReminderLabel(n: number): string {
  return `${ORDINAL_WORDS[n - 1] ?? `${n}th`} Reminder`;
}

type DueReview = {
  id: string;
  review_period: string;
  summary: string | null;
  sent_to_email: string | null;
  sent_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  client_ack_token: string | null;
  pdf_storage_path: string | null;
  clients: { name: string } | { name: string }[] | null;
};

/**
 * Weekly (or whatever's configured under Settings -> Integrations ->
 * Quarterly Review Reminders) re-send of an unacknowledged "sent" review to
 * the client — same email/PDF as the original send, labeled First
 * Reminder/Second Reminder/etc., until they acknowledge. Call this on a
 * cadence shorter than or equal to the configured interval (e.g. daily —
 * see other crons in this app) with header `X-Cron-Secret: <CRON_SECRET>`;
 * this route itself decides which reviews are actually due, so running it
 * more often than the interval is harmless — a review only ever gets
 * re-sent once its own interval has elapsed since sent_at/last_reminder_at.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const settings = await getQuarterlyReviewReminderSettings(admin);
  const intervalMs = settings.reminderIntervalDays * 24 * 60 * 60 * 1000;

  const { data: dueCandidates, error } = await admin
    .from("quarterly_reviews")
    .select(
      "id, review_period, summary, sent_to_email, sent_at, reminder_count, last_reminder_at, client_ack_token, pdf_storage_path, clients(name)"
    )
    .eq("status", "sent")
    .is("client_acknowledged_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const due = ((dueCandidates ?? []) as DueReview[]).filter((r) => {
    if (!r.sent_to_email || !r.client_ack_token) return false;
    const lastContact = new Date(r.last_reminder_at ?? r.sent_at ?? now).getTime();
    return now - lastContact >= intervalMs;
  });

  if (due.length === 0) {
    return NextResponse.json({ sent: 0, results: [] });
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) {
    return NextResponse.json({ error: "SHARED_MAILBOX_EMAIL isn't set." }, { status: 500 });
  }
  const sharedMailboxSettings = await getSharedMailboxSettings(admin);
  if (!sharedMailboxSettings) {
    return NextResponse.json({ error: "The shared mailbox integration isn't set up yet." }, { status: 500 });
  }
  const accessToken = await getValidSharedMailboxToken(admin, sharedMailboxSettings);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const results: { reviewId: string; ok: boolean; reminder?: number; error?: string }[] = [];

  for (const review of due) {
    const client = Array.isArray(review.clients) ? review.clients[0] : review.clients;
    const clientName = client?.name ?? "the client";
    const reminderNumber = review.reminder_count + 1;
    const ackUrl = `${appUrl}/quarterly-review-ack/${review.client_ack_token}`;

    try {
      const attachments: SharedMailboxAttachment[] = [];
      if (review.pdf_storage_path) {
        const { data: blob, error: downloadError } = await admin.storage
          .from(QUARTERLY_REVIEW_PDF_BUCKET)
          .download(review.pdf_storage_path);
        if (!downloadError && blob) {
          attachments.push({
            filename: `${clientName} Quarterly Review - ${review.review_period}.pdf`,
            contentBase64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
            contentType: "application/pdf",
          });
        }
      }

      const { html, text } = buildQuarterlyReviewClientEmail(
        clientName,
        review.review_period,
        review.summary,
        ackUrl,
        ordinalReminderLabel(reminderNumber)
      );
      await sendMailAsSharedMailbox(accessToken, mailboxEmail, {
        to: review.sent_to_email!,
        subject: `${ordinalReminderLabel(reminderNumber)}: Quarterly Systems Review — ${review.review_period} — ${clientName}`,
        html,
        text,
        attachments,
      });

      await admin
        .from("quarterly_reviews")
        .update({ reminder_count: reminderNumber, last_reminder_at: new Date().toISOString() })
        .eq("id", review.id);

      results.push({ reviewId: review.id, ok: true, reminder: reminderNumber });
    } catch (err) {
      console.error("quarterly-review-reminders: send failed", { reviewId: review.id, err });
      results.push({ reviewId: review.id, ok: false, error: err instanceof Error ? err.message : "send failed" });
    }
  }

  return NextResponse.json({ sent: results.filter((r) => r.ok).length, results });
}
