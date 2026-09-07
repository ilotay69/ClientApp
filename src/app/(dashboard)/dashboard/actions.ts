"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { reviewMailbox, type MailboxReviewResult } from "@/lib/mailbox-review";
import type { SuggestionStatus, MailConnection } from "@/lib/types";

export type MailboxReviewState = { error: string | null; result: MailboxReviewResult | null };

/** Live read of the signed-in user's own connected mailbox — nothing here
 * is persisted (no email content is written to any table); the result is
 * only ever returned to the button that triggered it. */
export async function reviewMyMailbox(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: MailboxReviewState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _formData: FormData
): Promise<MailboxReviewState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", result: null };

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return {
      error: "Connect your mailbox first on the Mailbox settings page.",
      result: null,
    };
  }

  try {
    const result = await reviewMailbox(admin, connection as MailConnection);
    return { error: null, result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Mailbox review failed.", result: null };
  }
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus) {
  const admin = createAdminClient();
  await admin.from("suggestions").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}
