"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { reviewMailbox, MAX_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, type MailboxReviewResult } from "@/lib/mailbox-review";
import type { SuggestionStatus, MailConnection } from "@/lib/types";

export type MailboxReviewState = { error: string | null; result: MailboxReviewResult | null };

/** Live read of the signed-in user's own connected mailbox — nothing here
 * is persisted except the three preference fields below (subfolder,
 * excludes, days-back), never email content. `days`/`focus`/`subfolder`/
 * `excludes` come from the form (see MailboxReviewPanel) — `days` is
 * clamped again here defensively even though the input already caps at
 * 90, since form data can't be trusted just because the input has a max
 * attribute. The subfolder/excludes/days are saved back to this user's
 * own mail_connections row on every run, so the form comes back
 * pre-filled next time (the free-text `focus` question is deliberately
 * NOT remembered — it's a one-off query, not a standing preference). */
export async function reviewMyMailbox(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: MailboxReviewState,
  formData: FormData
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

  const rawDays = Number(formData.get("days"));
  const lookbackDays = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.trunc(rawDays), MAX_LOOKBACK_DAYS) : DEFAULT_LOOKBACK_DAYS;
  const focus = String(formData.get("focus") ?? "").trim() || undefined;
  const subfolder = String(formData.get("subfolder") ?? "").trim();
  const excludeTerms = String(formData.get("excludes") ?? "").trim();

  await admin
    .from("mail_connections")
    .update({
      review_subfolder: subfolder || null,
      review_excludes: excludeTerms || null,
      review_lookback_days: lookbackDays,
    })
    .eq("user_id", user.id);

  try {
    const result = await reviewMailbox(admin, connection as MailConnection, {
      lookbackDays,
      focus,
      subfolder: subfolder || undefined,
      excludeTerms: excludeTerms || undefined,
    });
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
