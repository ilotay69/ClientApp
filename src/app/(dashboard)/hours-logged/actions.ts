"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getMyPermissions, isStaffRole } from "@/lib/permissions";
import { LOGGED_HOURS_LABEL_OPTIONS, type LoggedHoursLabel } from "@/lib/logged-hours";

export type LoggedHoursActionState = { error: string | null };

const VALID_LABELS = new Set<string>(LOGGED_HOURS_LABEL_OPTIONS.map((o) => o.value));

/** One entry per person per day per label - re-submitting the same date
 * and label corrects it in place rather than adding a second row
 * (logged_hours.unique(user_id, work_date, label), migration 145). Always
 * writes as the signed-in user - there's no way to log hours on someone
 * else's behalf, owner included. */
export async function upsertLoggedHoursAction(
  _prevState: LoggedHoursActionState,
  formData: FormData
): Promise<LoggedHoursActionState> {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !isStaffRole(me.role)) {
    return { error: "You don't have permission to do that." };
  }

  const workDate = String(formData.get("work_date") ?? "");
  const hours = Number(formData.get("hours"));
  const label = String(formData.get("label") ?? "regular") as LoggedHoursLabel;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { error: "Pick a valid date." };
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { error: "Enter hours greater than 0 and no more than 24." };
  }
  if (!VALID_LABELS.has(label)) {
    return { error: "Pick a valid label." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("logged_hours")
    .upsert({ user_id: me.userId, work_date: workDate, hours, label }, { onConflict: "user_id,work_date,label" });

  if (error) return { error: error.message };

  revalidatePath("/my-todo");
  return { error: null };
}

/** Scoped to the caller's own id even on the admin client - an owner's
 * extra visibility into everyone's hours is read-only (see the page's own
 * gating), not license to edit or delete someone else's entry. */
export async function deleteLoggedHoursAction(id: string): Promise<void> {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !isStaffRole(me.role)) return;

  const admin = createAdminClient();
  await admin.from("logged_hours").delete().eq("id", id).eq("user_id", me.userId);

  revalidatePath("/my-todo");
}
