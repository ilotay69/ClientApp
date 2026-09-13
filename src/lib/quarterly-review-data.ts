import { createAdminClient } from "@/lib/supabase/server";
import { QUARTERLY_REVIEW_SECTIONS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

/** The one person who can approve a submitted review, and who also always
 * gets alerted/emailed alongside the review's creator when a client
 * acknowledges one — a specific named account, not a permission. Single
 * source of truth: actions.ts and [id]/page.tsx both import this instead
 * of each declaring their own copy. */
export const QUARTERLY_REVIEW_APPROVER_EMAIL = "ilotay@cgtechnologies.com";

export type QuarterlyReviewStatus = "draft" | "submitted" | "approved" | "sent";

export type QuarterlyReviewItemRow = {
  id: string;
  itemKey: string;
  status: QuarterlyReviewItemStatus;
  comments: string | null;
};

export type QuarterlyReview = {
  id: string;
  clientId: string;
  clientName: string;
  reviewPeriod: string;
  status: QuarterlyReviewStatus;
  /** The creator's profile id — used to route an in-app alert to them
   * (approved / adjustment-requested), separate from createdByName/Email
   * which come off the joined profile. */
  createdById: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  sentAt: string | null;
  sentByName: string | null;
  sentToEmail: string | null;
  createdAt: string;
  /** Client-facing, editable — starts as an AI draft, staff can rewrite it
   * freely. Included in the client email. */
  summary: string | null;
  /** Internal-only time tracking — never passed to
   * buildQuarterlyReviewClientEmail, so there's no code path that could
   * leak it to the client. */
  hoursSpent: number | null;
  /** Set when the approver sends a submitted review back for changes
   * instead of approving it — cleared again once it's actually approved,
   * so it only reflects the current, unresolved round of feedback (if
   * any), not history. */
  adjustmentNotes: string | null;
  adjustmentRequestedAt: string | null;
  adjustmentRequestedByName: string | null;
  /** Set once the review has actually been emailed (sendQuarterlyReviewToClientAction) —
   * the storage path of that exact PDF, re-downloadable afterward. */
  pdfStoragePath: string | null;
  /** Set when the client clicks the acknowledgment link in their email
   * (src/app/quarterly-review-ack) — never set by anything in-app. Resets
   * to null on every new send, along with a fresh client_ack_token, so an
   * old round's acknowledgment can't be confused for the current one. */
  clientAcknowledgedAt: string | null;
  clientAckRemarks: string | null;
  items: QuarterlyReviewItemRow[];
};

const SELECT = `
  id, review_period, status, created_by, submitted_at, approved_at, sent_at, sent_to_email, created_at,
  summary, hours_spent, adjustment_notes, adjustment_requested_at, pdf_storage_path,
  client_acknowledged_at, client_ack_remarks,
  clients(name),
  created_profile:created_by(full_name, email),
  submitted_profile:submitted_by(full_name),
  approved_profile:approved_by(full_name),
  sent_profile:sent_by(full_name),
  adjustment_profile:adjustment_requested_by(full_name),
  quarterly_review_items(id, item_key, status, comments)
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReview(row: any): QuarterlyReview {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const createdProfile = Array.isArray(row.created_profile) ? row.created_profile[0] : row.created_profile;
  const submittedProfile = Array.isArray(row.submitted_profile) ? row.submitted_profile[0] : row.submitted_profile;
  const approvedProfile = Array.isArray(row.approved_profile) ? row.approved_profile[0] : row.approved_profile;
  const sentProfile = Array.isArray(row.sent_profile) ? row.sent_profile[0] : row.sent_profile;
  const adjustmentProfile = Array.isArray(row.adjustment_profile) ? row.adjustment_profile[0] : row.adjustment_profile;
  const itemByKey = new Map<string, QuarterlyReviewItemRow>(
    (row.quarterly_review_items ?? []).map(
      (i: { id: string; item_key: string; status: QuarterlyReviewItemStatus; comments: string | null }) => [
        i.item_key,
        { id: i.id, itemKey: i.item_key, status: i.status, comments: i.comments },
      ]
    )
  );
  // Always the current section/item order — a newly added item just shows
  // as a fresh "na" row (id "") until it's actually saved.
  const items: QuarterlyReviewItemRow[] = QUARTERLY_REVIEW_SECTIONS.flatMap((s) => s.items).map((i) => {
    const existing = itemByKey.get(i.key);
    return existing ?? { id: "", itemKey: i.key, status: "na", comments: null };
  });

  return {
    id: row.id,
    clientId: row.client_id,
    clientName: client?.name ?? "Unknown client",
    reviewPeriod: row.review_period,
    status: row.status,
    createdById: row.created_by ?? null,
    createdByName: createdProfile?.full_name ?? null,
    createdByEmail: createdProfile?.email ?? null,
    submittedAt: row.submitted_at,
    submittedByName: submittedProfile?.full_name ?? null,
    approvedAt: row.approved_at,
    approvedByName: approvedProfile?.full_name ?? null,
    sentAt: row.sent_at,
    sentByName: sentProfile?.full_name ?? null,
    sentToEmail: row.sent_to_email,
    createdAt: row.created_at,
    summary: row.summary,
    hoursSpent: row.hours_spent === null || row.hours_spent === undefined ? null : Number(row.hours_spent),
    adjustmentNotes: row.adjustment_notes ?? null,
    adjustmentRequestedAt: row.adjustment_requested_at ?? null,
    adjustmentRequestedByName: adjustmentProfile?.full_name ?? null,
    pdfStoragePath: row.pdf_storage_path ?? null,
    clientAcknowledgedAt: row.client_acknowledged_at ?? null,
    clientAckRemarks: row.client_ack_remarks ?? null,
    items,
  };
}

export async function createQuarterlyReview(
  clientId: string,
  reviewPeriod: string,
  createdBy: string,
  admin: AdminClient = createAdminClient()
): Promise<string> {
  const { data, error } = await admin
    .from("quarterly_reviews")
    .insert({ client_id: clientId, review_period: reviewPeriod, created_by: createdBy })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't create quarterly review: ${error.message}`);

  await admin.from("quarterly_review_items").insert(
    QUARTERLY_REVIEW_SECTIONS.flatMap((s) => s.items).map((i) => ({ review_id: data.id, item_key: i.key }))
  );

  return data.id;
}

export async function getQuarterlyReview(
  reviewId: string,
  admin: AdminClient = createAdminClient()
): Promise<QuarterlyReview | null> {
  const { data, error } = await admin
    .from("quarterly_reviews")
    .select(`client_id, ${SELECT}`)
    .eq("id", reviewId)
    .maybeSingle();
  if (error || !data) return null;
  return mapReview(data);
}

export type QuarterlyReviewAckLookup = {
  id: string;
  clientName: string;
  reviewPeriod: string;
  createdById: string | null;
  alreadyAcknowledged: boolean;
  acknowledgedAt: string | null;
  remarks: string | null;
};

/** Looked up by the random, unguessable client_ack_token from the public
 * acknowledgment link (src/app/quarterly-review-ack) — never by review id,
 * since that page has no login at all and must not accept an arbitrary id
 * straight from the URL. */
export async function getQuarterlyReviewByAckToken(
  token: string,
  admin: AdminClient = createAdminClient()
): Promise<QuarterlyReviewAckLookup | null> {
  const { data, error } = await admin
    .from("quarterly_reviews")
    .select("id, review_period, created_by, client_acknowledged_at, client_ack_remarks, clients(name)")
    .eq("client_ack_token", token)
    .maybeSingle();
  if (error || !data) return null;

  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients;
  return {
    id: data.id,
    clientName: client?.name ?? "Unknown client",
    reviewPeriod: data.review_period,
    createdById: data.created_by ?? null,
    alreadyAcknowledged: Boolean(data.client_acknowledged_at),
    acknowledgedAt: data.client_acknowledged_at ?? null,
    remarks: data.client_ack_remarks ?? null,
  };
}

export async function fetchReviewsForClient(
  clientId: string,
  admin: AdminClient = createAdminClient()
): Promise<QuarterlyReview[]> {
  const { data } = await admin
    .from("quarterly_reviews")
    .select(`client_id, ${SELECT}`)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown[]).map(mapReview);
}

/** Every review across every client, newest first — used by the
 * portfolio-wide "All Clients" view (as opposed to fetchReviewsForClient,
 * scoped to one). */
export async function fetchAllReviews(admin: AdminClient = createAdminClient()): Promise<QuarterlyReview[]> {
  const { data } = await admin
    .from("quarterly_reviews")
    .select(`client_id, ${SELECT}`)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown[]).map(mapReview);
}

export type ReviewTab = "incomplete" | "approved" | "sent";
export const REVIEW_TABS: ReviewTab[] = ["incomplete", "approved", "sent"];
export const REVIEW_TAB_LABELS: Record<ReviewTab, string> = {
  incomplete: "Incomplete",
  approved: "Approved",
  sent: "Sent to Client",
};

// A review is only ever in exactly one of these three buckets —
// "submitted" (waiting on the approver) still counts as Incomplete since
// it isn't done yet, it just isn't editable by most staff while it waits.
export function reviewBucket(status: QuarterlyReviewStatus): ReviewTab {
  if (status === "sent") return "sent";
  if (status === "approved") return "approved";
  return "incomplete";
}

// Whoever's name is shown here is "the person currently working on it" for
// that status — the creator while it's still a draft, the submitter while
// it waits on approval, then the approver, then whoever actually sent it.
export function reviewActorLabel(review: QuarterlyReview): string {
  switch (review.status) {
    case "draft":
      return review.createdByName ? `${review.createdByName} — drafting` : "Drafting";
    case "submitted":
      return review.submittedByName
        ? `${review.submittedByName} — submitted, awaiting approval`
        : "Awaiting approval";
    case "approved":
      return review.approvedByName ? `${review.approvedByName} — approved` : "Approved";
    case "sent":
      return review.sentByName ? `${review.sentByName} — sent` : "Sent";
  }
}

export async function fetchAllClientsForPicker(
  admin: AdminClient = createAdminClient()
): Promise<{ id: string; name: string; primaryContactEmail: string | null }[]> {
  const { data } = await admin.from("clients").select("id, name, primary_contact_email").order("name");
  return ((data ?? []) as { id: string; name: string; primary_contact_email: string | null }[]).map((c) => ({
    id: c.id,
    name: c.name,
    primaryContactEmail: c.primary_contact_email,
  }));
}

export const QUARTERLY_REVIEW_ATTACHMENTS_BUCKET = "quarterly-review-attachments";
/** Holds the actual PDF sent to the client (see sendQuarterlyReviewToClientAction)
 * so it can be opened/downloaded again afterward — from a client's own
 * record (normal staff, not just manage_quarterly_reviews holders) and
 * from the client's own portal login. */
export const QUARTERLY_REVIEW_PDF_BUCKET = "quarterly-review-pdfs";

export type QuarterlyReviewAttachment = {
  id: string;
  storagePath: string;
  fileName: string;
  label: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export async function fetchReviewAttachments(
  reviewId: string,
  admin: AdminClient = createAdminClient()
): Promise<QuarterlyReviewAttachment[]> {
  const { data } = await admin
    .from("quarterly_review_attachments")
    .select("id, storage_path, file_name, label, content_type, file_size_bytes, created_at")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  return (
    (data ?? []) as {
      id: string;
      storage_path: string;
      file_name: string;
      label: string | null;
      content_type: string | null;
      file_size_bytes: number | null;
      created_at: string;
    }[]
  ).map((a) => ({
    id: a.id,
    storagePath: a.storage_path,
    fileName: a.file_name,
    label: a.label,
    contentType: a.content_type,
    sizeBytes: a.file_size_bytes,
    createdAt: a.created_at,
  }));
}
