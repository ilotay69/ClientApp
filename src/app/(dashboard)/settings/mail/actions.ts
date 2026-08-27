"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { syncMailConnection } from "@/lib/mail-sync";
import type { MailConnection } from "@/lib/types";

export type SyncState = { error: string | null; summary: string | null };

export async function syncNow(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: SyncState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _formData: FormData
): Promise<SyncState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", summary: null };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!connection) {
    return { error: "No mailbox connected yet.", summary: null };
  }

  try {
    const result = await syncMailConnection(admin, connection as MailConnection);
    revalidatePath("/settings/mail");
    return {
      error: null,
      summary: `Scanned ${result.scanned} email${result.scanned === 1 ? "" : "s"}, linked ${result.matched} to clients.`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Sync failed.",
      summary: null,
    };
  }
}

export async function disconnectMailbox() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  await admin.from("mail_connections").delete().eq("user_id", user.id);
  revalidatePath("/settings/mail");
}
