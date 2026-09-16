import { createAdminClient } from "@/lib/supabase/server";
import {
  getQuarterlyReviewSections,
  type QuarterlyReviewItemStatus,
  type QuarterlyReviewTemplateKey,
} from "@/lib/quarterly-review-sections";
import { buildQuarterlyReviewPdf } from "@/lib/quarterly-review-pdf";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchOpenQuarterlyReviewSlaTickets, fetchActiveResources } from "@/lib/autotask";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

/** Fallback default only — the real value is configurable under Settings ->
 * Integrations (see getQuarterlyReviewApproverEmail below) and this constant
 * only matters if that settings row is somehow missing. The one person who
 * can approve a submitted review, and who also always gets alerted/emailed
 * alongside the review's creator when a client acknowledges one — a
 * specific named account, not a permission. */
export const QUARTERLY_REVIEW_APPROVER_EMAIL = "ilotay@cgtechnologies.com";

export type QuarterlyReviewReminderSettings = {
  approverEmail: string;
  reminderIntervalDays: number;
};

/** Configurable under Settings -> Integrations
 * (quarterly-review-reminder-settings-form.tsx) instead of a hardcoded
 * constant — who approves reviews, and how often an unacknowledged "sent"
 * review gets re-emailed to the client. Falls back to the hardcoded default
 * above if the settings row is somehow missing (it's seeded by
 * 114_quarterly_review_reminders.sql, so this should only matter before
 * that migration has run). */
export async function getQuarterlyReviewReminderSettings(
  admin: AdminClient = createAdminClient()
): Promise<QuarterlyReviewReminderSettings> {
  const { data } = await admin
    .from("quarterly_review_reminder_settings")
    .select("approver_email, reminder_interval_days")
    .eq("id", true)
    .maybeSingle();
  return {
    approverEmail: data?.approver_email || QUARTERLY_REVIEW_APPROVER_EMAIL,
    reminderIntervalDays: data?.reminder_interval_days ?? 7,
  };
}

/** Just the approver-email half of the settings above — most call sites
 * only need this, not the reminder cadence too. */
export async function getQuarterlyReviewApproverEmail(
  admin: AdminClient = createAdminClient()
): Promise<string> {
  const settings = await getQuarterlyReviewReminderSettings(admin);
  return settings.approverEmail;
}

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
  /** Set only when the approver manually recorded the acknowledgment
   * (markClientAcknowledgedManuallyAction) because the client replied by
   * email instead of clicking the link — null when the client acknowledged
   * themselves via the public ack page. */
  clientAckConfirmedByName: string | null;
  /** How many reminder emails have gone out for the current "sent" round —
   * reset to 0 on every fresh send, same as client_ack_token. Drives the
   * "First Reminder"/"Second Reminder" label on the next one. */
  reminderCount: number;
  lastReminderAt: string | null;
  /** Free text — which Autotask ticket (if any) this review relates to.
   * Internal-only, same posture as hoursSpent: never passed to
   * buildQuarterlyReviewClientEmail/buildQuarterlyReviewPdf. */
  ticketNumber: string | null;
  /** Client-facing, editable — same "generate a starting point, then
   * rewrite freely" pattern as summary. When empty, buildQuarterlyReviewPdf
   * computes this section automatically from the checklist instead. */
  actionItemsNotes: string | null;
  changesSinceLastReviewNotes: string | null;
  /** Which checklist this review was built from (see
   * getQuarterlyReviewSections) — picked once when the review is started
   * and fixed for its whole life, same as ticketNumber/hoursSpent. */
  template: QuarterlyReviewTemplateKey;
  items: QuarterlyReviewItemRow[];
};

const SELECT = `
  id, review_period, status, created_by, submitted_at, approved_at, sent_at, sent_to_email, created_at,
  summary, hours_spent, adjustment_notes, adjustment_requested_at, pdf_storage_path,
  client_acknowledged_at, client_ack_remarks, ticket_number, template,
  action_items_notes, changes_since_last_review_notes,
  reminder_count, last_reminder_at,
  clients(name),
  created_profile:created_by(full_name, email),
  submitted_profile:submitted_by(full_name),
  approved_profile:approved_by(full_name),
  sent_profile:sent_by(full_name),
  adjustment_profile:adjustment_requested_by(full_name),
  ack_confirmed_profile:client_ack_confirmed_by(full_name),
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
  const ackConfirmedProfile = Array.isArray(row.ack_confirmed_profile) ? row.ack_confirmed_profile[0] : row.ack_confirmed_profile;
  const itemByKey = new Map<string, QuarterlyReviewItemRow>(
    (row.quarterly_review_items ?? []).map(
      (i: { id: string; item_key: string; status: QuarterlyReviewItemStatus; comments: string | null }) => [
        i.item_key,
        { id: i.id, itemKey: i.item_key, status: i.status, comments: i.comments },
      ]
    )
  );
  const template: QuarterlyReviewTemplateKey = row.template === "avd" ? "avd" : "standard";
  // Always the current section/item order for this review's own template —
  // a newly added item just shows as a fresh "na" row (id "") until it's
  // actually saved.
  const items: QuarterlyReviewItemRow[] = getQuarterlyReviewSections(template).flatMap((s) => s.items).map((i) => {
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
    clientAckConfirmedByName: ackConfirmedProfile?.full_name ?? null,
    reminderCount: row.reminder_count ?? 0,
    lastReminderAt: row.last_reminder_at ?? null,
    ticketNumber: row.ticket_number ?? null,
    actionItemsNotes: row.action_items_notes ?? null,
    changesSinceLastReviewNotes: row.changes_since_last_review_notes ?? null,
    template,
    items,
  };
}

export async function createQuarterlyReview(
  clientId: string,
  reviewPeriod: string,
  createdBy: string,
  admin: AdminClient = createAdminClient(),
  /** Pre-filled from a tech's pick among that client's open "quarterly
   * review" recurring tickets (see fetchOpenQuarterlyReviewTickets) —
   * optional since a client might not have one open yet. */
  extra?: { ticketNumber?: string | null; hoursSpent?: number | null },
  template: QuarterlyReviewTemplateKey = "standard"
): Promise<string> {
  const { data, error } = await admin
    .from("quarterly_reviews")
    .insert({
      client_id: clientId,
      review_period: reviewPeriod,
      created_by: createdBy,
      ticket_number: extra?.ticketNumber ?? null,
      hours_spent: extra?.hoursSpent ?? null,
      template,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't create quarterly review: ${error.message}`);

  await admin.from("quarterly_review_items").insert(
    getQuarterlyReviewSections(template).flatMap((s) => s.items).map((i) => ({ review_id: data.id, item_key: i.key }))
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

export type PreviousReviewSnapshot = {
  reviewPeriod: string;
  itemsByKey: Map<string, { status: QuarterlyReviewItemStatus; comments: string | null }>;
};

/** The most recent OTHER review for this client (any status), for the
 * read-only "what we filled in last time" reference shown below each
 * section on the edit page — staff/approver only, never included in the
 * PDF or client email. Null if this is the client's first review. */
export async function fetchPreviousReviewSnapshot(
  clientId: string,
  excludeReviewId: string,
  admin: AdminClient = createAdminClient()
): Promise<PreviousReviewSnapshot | null> {
  const { data } = await admin
    .from("quarterly_reviews")
    .select("id, review_period, quarterly_review_items(item_key, status, comments)")
    .eq("client_id", clientId)
    .neq("id", excludeReviewId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  type Row = { item_key: string; status: QuarterlyReviewItemStatus; comments: string | null };
  const itemsByKey = new Map<string, { status: QuarterlyReviewItemStatus; comments: string | null }>(
    ((data.quarterly_review_items ?? []) as Row[]).map((i) => [i.item_key, { status: i.status, comments: i.comments }])
  );
  return { reviewPeriod: data.review_period, itemsByKey };
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

export type QuarterlyReviewSlaTicketRow = {
  ticketId: number;
  ticketNumber: string | null;
  title: string;
  hoursLogged: number;
  clientId: string;
  clientName: string;
};

/** Every open Autotask ticket tagged with the "Quarterly Reviews SLA"
 * service level agreement, joined against our own clients table so each
 * one carries the clientId a new review actually needs — shown on the
 * main Quarterly Reviews page so a tech can jump straight from the
 * ticket that triggered a review to starting one, without hand-picking a
 * client or being asked to identify the ticket again (see
 * fetchOpenQuarterlyReviewSlaTickets for how these are found in Autotask).
 * Filtered down to two things:
 *  - Only tickets assigned to the current tech, when we can resolve who
 *    that is in Autotask terms — same resolution order as
 *    fetchMyOpenAutotaskTickets (explicit profiles.autotask_resource_id
 *    first, full_name match as a fallback). Left unfiltered (every tech's
 *    tickets) when neither resolves, rather than silently showing nothing
 *    to someone who hasn't linked an Autotask Resource yet.
 *  - Never a ticket that's already been used to start some review (any
 *    status) — createQuarterlyReview stamps quarterly_reviews.ticket_number
 *    from whichever ticket was picked, so once used it shouldn't be
 *    offered again.
 * A ticket whose company isn't linked to any client here is silently
 * dropped — there'd be nothing to attach the review to. Returns an empty
 * list (not an error) whenever Autotask isn't connected or has no ticket
 * matching that SLA — both normal, not failures. */
export async function fetchOpenQuarterlyReviewSlaTicketsForDisplay(
  currentUser: { fullName: string | null; autotaskResourceId: number | null },
  admin: AdminClient = createAdminClient()
): Promise<QuarterlyReviewSlaTicketRow[]> {
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) return [];

  let tickets;
  try {
    tickets = await fetchOpenQuarterlyReviewSlaTickets(settings.credentials, settings.zoneUrl);
  } catch (err) {
    console.error("fetchOpenQuarterlyReviewSlaTicketsForDisplay: Autotask lookup failed", err);
    return [];
  }
  if (tickets.length === 0) return [];

  let myResourceId: number | null = currentUser.autotaskResourceId;
  if (myResourceId == null && currentUser.fullName) {
    const resources = await fetchActiveResources(settings.credentials, settings.zoneUrl);
    const match = resources.find((r) => r.name.toLowerCase() === currentUser.fullName!.toLowerCase());
    myResourceId = match?.id ?? null;
  }
  if (myResourceId != null) {
    tickets = tickets.filter((t) => t.assignedResourceId === myResourceId);
  }
  if (tickets.length === 0) return [];

  const { data: usedRows } = await admin.from("quarterly_reviews").select("ticket_number").not("ticket_number", "is", null);
  const usedTicketNumbers = new Set(
    ((usedRows ?? []) as { ticket_number: string | null }[]).map((r) => r.ticket_number).filter(Boolean)
  );
  tickets = tickets.filter((t) => !t.ticketNumber || !usedTicketNumbers.has(t.ticketNumber));
  if (tickets.length === 0) return [];

  const companyIds = [...new Set(tickets.map((t) => t.companyId))];
  const { data: clients } = await admin
    .from("clients")
    .select("id, name, autotask_company_id")
    .in("autotask_company_id", companyIds);
  const clientByCompanyId = new Map<number, { id: string; name: string }>();
  for (const c of (clients ?? []) as { id: string; name: string; autotask_company_id: number | null }[]) {
    if (c.autotask_company_id != null) clientByCompanyId.set(c.autotask_company_id, { id: c.id, name: c.name });
  }

  return tickets
    .map((t) => {
      const client = clientByCompanyId.get(t.companyId);
      if (!client) return null;
      return {
        ticketId: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        hoursLogged: t.hoursLogged,
        clientId: client.id,
        clientName: client.name,
      };
    })
    .filter((r): r is QuarterlyReviewSlaTicketRow => r !== null)
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
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

/** Fetches everything buildQuarterlyReviewPdf needs and builds the PDF —
 * shared by sendQuarterlyReviewToClientAction (the real send) and the
 * preview route (/api/quarterly-review-pdf-preview), so there's exactly
 * one place that assembles a review's PDF rather than two copies of the
 * same attachment-downloading/previous-review-lookup logic drifting apart.
 * Null if the review itself doesn't exist. */
export type AssembledQuarterlyReviewPdf = {
  pdf: Buffer;
  embeddedImageIds: Set<string>;
  /** Every screenshot's raw bytes, downloaded once — reused by callers
   * (sendQuarterlyReviewToClientAction) that need to attach anything NOT
   * in embeddedImageIds separately, without downloading it all again. */
  images: { id: string; buffer: Buffer; fileName: string; contentType: string }[];
};

export async function assembleQuarterlyReviewPdf(
  reviewId: string,
  admin: AdminClient = createAdminClient()
): Promise<AssembledQuarterlyReviewPdf | null> {
  const review = await getQuarterlyReview(reviewId, admin);
  if (!review) return null;

  const attachments = await fetchReviewAttachments(reviewId, admin);
  const images: { id: string; buffer: Buffer; label: string | null; fileName: string; contentType: string }[] = [];
  for (const a of attachments) {
    try {
      const { data: blob, error } = await admin.storage.from(QUARTERLY_REVIEW_ATTACHMENTS_BUCKET).download(a.storagePath);
      if (error || !blob) continue;
      images.push({
        id: a.id,
        buffer: Buffer.from(await blob.arrayBuffer()),
        label: a.label,
        fileName: a.fileName,
        contentType: a.contentType || "image/png",
      });
    } catch (err) {
      console.error("assembleQuarterlyReviewPdf: attachment fetch failed", a.id, err);
    }
  }

  const previousReview = await fetchPreviousReviewSnapshot(review.clientId, reviewId, admin);
  const previousItems = previousReview
    ? new Map([...previousReview.itemsByKey.entries()].map(([key, row]) => [key, row.status]))
    : null;

  // Same columns client-ninjaone-devices.tsx queries for the Clients page's
  // own Devices tab — whatever's already synced there, no live NinjaOne API
  // call needed here. Empty for a client with no NinjaOne mapping (or
  // nothing synced yet), which just omits the PDF's Device Health section.
  const { data: deviceRows } = await admin
    .from("ninjaone_devices")
    .select(
      "id, system_name, node_class, is_offline, last_contact, device_created_at, manufacturer_fulfillment_date, os_name, disk_total_bytes, disk_free_bytes"
    )
    .eq("client_id", review.clientId)
    .order("system_name");

  const { pdf, embeddedImageIds } = buildQuarterlyReviewPdf({
    clientName: review.clientName,
    reviewPeriod: review.reviewPeriod,
    template: review.template,
    summary: review.summary,
    items: review.items.map((i) => ({ itemKey: i.itemKey, status: i.status, comments: i.comments })),
    images: images.map((i) => ({ id: i.id, buffer: i.buffer, label: i.label, fileName: i.fileName })),
    previousItems,
    actionItemsText: review.actionItemsNotes,
    changesSinceLastReviewText: review.changesSinceLastReviewNotes,
    devices: deviceRows ?? [],
  });

  return {
    pdf,
    embeddedImageIds,
    images: images.map((i) => ({ id: i.id, buffer: i.buffer, fileName: i.fileName, contentType: i.contentType })),
  };
}
