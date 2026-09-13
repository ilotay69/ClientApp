import { createAdminClient } from "@/lib/supabase/server";
import { QUARTERLY_REVIEW_SECTIONS, type QuarterlyReviewItemStatus } from "@/lib/quarterly-review-sections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

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
  createdByName: string | null;
  createdByEmail: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  createdAt: string;
  items: QuarterlyReviewItemRow[];
};

const SELECT = `
  id, review_period, status, submitted_at, approved_at, sent_at, sent_to_email, created_at,
  clients(name),
  created_profile:created_by(full_name, email),
  approved_profile:approved_by(full_name),
  quarterly_review_items(id, item_key, status, comments)
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReview(row: any): QuarterlyReview {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const createdProfile = Array.isArray(row.created_profile) ? row.created_profile[0] : row.created_profile;
  const approvedProfile = Array.isArray(row.approved_profile) ? row.approved_profile[0] : row.approved_profile;
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
    createdByName: createdProfile?.full_name ?? null,
    createdByEmail: createdProfile?.email ?? null,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    approvedByName: approvedProfile?.full_name ?? null,
    sentAt: row.sent_at,
    sentToEmail: row.sent_to_email,
    createdAt: row.created_at,
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
