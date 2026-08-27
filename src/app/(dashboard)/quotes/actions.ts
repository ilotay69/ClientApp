"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { QuoteStatus } from "@/lib/types";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseQuoteFields(formData: FormData) {
  const amountRaw = emptyToNull(formData.get("amount"));
  return {
    client_id: String(formData.get("client_id") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    amount: amountRaw ? Number(amountRaw) : null,
    status: String(formData.get("status") ?? "draft") as QuoteStatus,
    sent_date: emptyToNull(formData.get("sent_date")),
    follow_up_due_date: emptyToNull(formData.get("follow_up_due_date")),
    notes: emptyToNull(formData.get("notes")),
  };
}

export async function createQuote(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fields = parseQuoteFields(formData);
  if (!fields.client_id) return { error: "Select a client." };
  if (!fields.title) return { error: "Title is required." };

  const { data, error } = await supabase
    .from("quotes")
    .insert({ ...fields, owner_id: user?.id ?? null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/quotes");
  revalidatePath(`/clients/${fields.client_id}`);
  redirect(`/quotes/${data.id}`);
}

export async function updateQuote(
  quoteId: string,
  clientId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const fields = parseQuoteFields(formData);
  if (!fields.title) return { error: "Title is required." };

  const { error } = await supabase
    .from("quotes")
    .update(fields)
    .eq("id", quoteId);

  if (error) return { error: error.message };

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
  revalidatePath(`/clients/${clientId}`);
  return { error: null };
}

export async function markQuoteFollowedUp(quoteId: string, clientId: string) {
  const supabase = await createClient();
  await supabase
    .from("quotes")
    .update({ last_followed_up_at: new Date().toISOString() })
    .eq("id", quoteId);

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteQuote(quoteId: string, clientId: string) {
  const supabase = await createClient();
  await supabase.from("quotes").delete().eq("id", quoteId);
  revalidatePath("/quotes");
  revalidatePath(`/clients/${clientId}`);
  redirect("/quotes");
}
