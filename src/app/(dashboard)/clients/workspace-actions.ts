"use server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import type { ClientPreview } from "@/components/clients/directory";

/** Read-only preview: the same permission and RLS boundary as the client page. */
export async function previewClient(
  id: string,
): Promise<{ data: ClientPreview } | { error: string }> {
  if (!(await requirePermission("view_clients")))
    return { error: "You don’t have access to client records." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Client unavailable." };
  const db = await createClient();
  const { data, error } = await db
    .from("clients")
    .select(
      "name, primary_contact_name, primary_contact_email, primary_contact_phone, address",
    )
    .eq("id", id)
    .single();
  if (error || !data)
    return { error: "This client could not be loaded. Please try again." };
  return { data };
}
