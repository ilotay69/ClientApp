"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";

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
  const { error } = await supabase.from("sales_requests").insert({
    client_id: emptyToNull(formData.get("client_id")),
    title,
    detail: emptyToNull(formData.get("detail")),
    requested_by_name: emptyToNull(formData.get("requested_by_name")),
    requested_by_email: emptyToNull(formData.get("requested_by_email")),
    assigned_to: emptyToNull(formData.get("assigned_to")),
  });

  if (error) return { error: error.message };

  revalidatePath("/sales-requests");
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
}

export async function deleteSalesRequest(requestId: string) {
  if (!(await requirePermission("manage_sales_requests"))) return;

  const supabase = await createClient();
  await supabase.from("sales_requests").delete().eq("id", requestId);

  revalidatePath("/sales-requests");
  revalidatePath("/clients");
}
