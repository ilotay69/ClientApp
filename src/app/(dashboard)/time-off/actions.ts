"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getMyPermissions, isStaffRole } from "@/lib/permissions";
import { createAlert } from "@/lib/alerts";

export type TimeOffActionState = { error: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOwnerIds(admin: any): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id").eq("role", "owner");
  return (data ?? []).map((r: { id: string }) => r.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFullName(admin: any, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name ?? "Someone";
}

function typeLabel(type: string): string {
  return type === "sick" ? "Sick" : "Vacation";
}

/** Alerts only, no email (see src/lib/alerts.ts) - same "task_assigned"
 * convention every other staff-to-staff notification in this app already
 * uses, not a dedicated email flow. */
export async function createTimeOffRequestAction(
  _prevState: TimeOffActionState,
  formData: FormData
): Promise<TimeOffActionState> {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !isStaffRole(me.role)) {
    return { error: "You don't have permission to do that." };
  }

  const type = String(formData.get("type") ?? "vacation");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (type !== "vacation" && type !== "sick") return { error: "Pick a valid type." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "Pick valid dates." };
  }
  if (endDate < startDate) return { error: "End date can't be before the start date." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("time_off_requests")
    .insert({ user_id: me.userId, type, start_date: startDate, end_date: endDate, reason })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not submit the request." };

  const [ownerIds, requesterName] = await Promise.all([fetchOwnerIds(admin), fetchFullName(admin, me.userId)]);
  await createAlert(
    admin,
    ownerIds,
    "time_off_requested",
    `${requesterName} requested time off`,
    `${typeLabel(type)} — ${startDate} to ${endDate}`,
    "/my-todo?tab=timeoff"
  );

  revalidatePath("/my-todo");
  return { error: null };
}

/** Owner-only. Guarded on status = 'pending' so re-submitting a stale
 * Approve/Decline click on an already-decided request no-ops instead of
 * silently flipping a decision back and forth. */
export async function decideTimeOffRequestAction(id: string, decision: "approved" | "declined"): Promise<void> {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || me.role !== "owner") return;

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("time_off_requests")
    .update({ status: decision, decided_by: me.userId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("user_id, type, start_date, end_date")
    .maybeSingle();
  if (!request) return;

  await createAlert(
    admin,
    [request.user_id],
    "time_off_decided",
    `Your time off request was ${decision}`,
    `${typeLabel(request.type)} — ${request.start_date} to ${request.end_date}`,
    "/my-todo?tab=timeoff"
  );

  revalidatePath("/my-todo");
}

/** Either side of a request may discuss it - the requester themselves, or
 * any owner. Notifies whichever side didn't write the note, never the
 * author of their own note. */
export async function addTimeOffNoteAction(
  _prevState: TimeOffActionState,
  formData: FormData
): Promise<TimeOffActionState> {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !isStaffRole(me.role)) {
    return { error: "You don't have permission to do that." };
  }

  const requestId = String(formData.get("request_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Enter a note." };

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("time_off_requests")
    .select("user_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "That request no longer exists." };
  if (me.role !== "owner" && request.user_id !== me.userId) {
    return { error: "You don't have permission to do that." };
  }

  const { error } = await admin
    .from("time_off_request_notes")
    .insert({ request_id: requestId, author_id: me.userId, body });
  if (error) return { error: error.message };

  const authorName = await fetchFullName(admin, me.userId);
  let recipientIds: string[];
  if (me.userId === request.user_id) {
    recipientIds = await fetchOwnerIds(admin);
  } else {
    recipientIds = [request.user_id];
  }
  recipientIds = recipientIds.filter((rid) => rid !== me.userId);

  await createAlert(
    admin,
    recipientIds,
    "time_off_note",
    `${authorName} left a note on a time off request`,
    body.length > 140 ? `${body.slice(0, 140)}…` : body,
    "/my-todo?tab=timeoff"
  );

  revalidatePath("/my-todo");
  return { error: null };
}

/** Lets the requester cancel their own request while it's still pending -
 * scoped to their own id and status = 'pending' even on the admin client,
 * so this can't touch anyone else's request or one already decided. */
export async function withdrawTimeOffRequestAction(id: string): Promise<void> {
  const supabase = await createClient();
  const me = await getMyPermissions(supabase);
  if (!me || !isStaffRole(me.role)) return;

  const admin = createAdminClient();
  await admin.from("time_off_requests").delete().eq("id", id).eq("user_id", me.userId).eq("status", "pending");

  revalidatePath("/my-todo");
}
