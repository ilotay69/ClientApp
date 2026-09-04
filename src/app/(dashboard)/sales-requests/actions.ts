"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { notifySalesRequestChange } from "@/lib/sales-request-notify";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createSalesRequest(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requirePermission("manage_sales_requests"))) {
    return { error: "You don't have permission to do that." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_requests")
    .insert({
      client_id: emptyToNull(formData.get("client_id")),
      title,
      detail: emptyToNull(formData.get("detail")),
      requested_by_name: emptyToNull(formData.get("requested_by_name")),
      requested_by_email: emptyToNull(formData.get("requested_by_email")),
      assigned_to: emptyToNull(formData.get("assigned_to")),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/sales-requests");
  await notifySalesRequestChange(data.id, "New sales request created.");
  return { error: null };
}

const EDITABLE_FIELDS = [
  "title",
  "detail",
  "stage",
  "client_id",
  "assigned_to",
  "requested_by_name",
  "requested_by_email",
] as const satisfies readonly string[];

const NULLABLE_FIELDS: readonly string[] = [
  "detail",
  "client_id",
  "assigned_to",
  "requested_by_name",
  "requested_by_email",
];

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  detail: "Detail",
  stage: "Stage",
  client_id: "Client",
  assigned_to: "Assignee",
  requested_by_name: "Requested by",
  requested_by_email: "Requester email",
};

export async function updateSalesRequestField(requestId: string, field: string, value: string) {
  if (!(await requirePermission("manage_sales_requests"))) return;
  if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) return;

  const nextValue = NULLABLE_FIELDS.includes(field) ? value.trim() || null : value;
  if (field === "title" && !String(nextValue ?? "").trim()) return;

  const supabase = await createClient();
  await supabase
    .from("sales_requests")
    .update({ [field]: nextValue })
    .eq("id", requestId);

  revalidatePath("/sales-requests");
  revalidatePath("/clients");
  await notifySalesRequestChange(requestId, `${FIELD_LABELS[field] ?? field} updated.`);
}

export async function deleteSalesRequest(requestId: string) {
  if (!(await requirePermission("manage_sales_requests"))) return;

  const supabase = await createClient();
  await supabase.from("sales_requests").delete().eq("id", requestId);

  revalidatePath("/sales-requests");
  revalidatePath("/clients");
}

export type SalesRequestNote = {
  id: string;
  body: string;
  created_at: string;
  authorName: string | null;
};

/** Live-fetched only when a row is expanded — matches the same on-demand
 * detail pattern used for Autotask ticket notes, rather than joining every
 * request's full note history into the list query up front. */
export async function getSalesRequestNotesAction(
  requestId: string
): Promise<{ notes: SalesRequestNote[] } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_request_notes")
    .select("id, body, created_at, profiles(full_name)")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) return { error: error.message };

  return {
    notes: (data ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      created_at: n.created_at,
      authorName: (n.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
    })),
  };
}

export async function addSalesRequestNote(
  requestId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Enter a note." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("sales_request_notes").insert({
    request_id: requestId,
    author_id: user?.id ?? null,
    body,
  });

  if (error) return { error: error.message };

  revalidatePath("/sales-requests");
  await notifySalesRequestChange(requestId, `New note: ${body.slice(0, 200)}`);
  return { error: null };
}
