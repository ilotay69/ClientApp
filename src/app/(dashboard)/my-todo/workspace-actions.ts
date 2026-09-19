"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireStaff, getMyPermissions } from "@/lib/permissions";
import {
  normalizePreferences,
  validateDraft,
  isDate,
  isUuid,
  TASK_STATUSES,
  type TodoTask,
  type TodoData,
  type Result,
  type TodoPreferences,
  type ItemState,
  type TaskDraft,
  type TaskStatus,
  type InboxData,
  type MailThread,
  type TimeData,
  type HoursEntry,
} from "@/lib/my-todo-workspace";
import {
  fetchMyOpenTicketsAction,
  reviewMyMailbox,
  syncMyMailboxNow,
  fetchMyUpcomingAppointments,
} from "../dashboard/actions";
import {
  createTimeOffRequestAction,
  decideTimeOffRequestAction,
  withdrawTimeOffRequestAction,
  addTimeOffNoteAction,
} from "../time-off/actions";
import { fetchTimeOffRequests } from "@/lib/time-off";
import { getTaskNotesAction, addTaskNote } from "../tasks/actions";

const TASK_SELECT =
  "id,title,detail,notes,status,priority,due_date,start_date,client_id,is_personal,updated_at,clients(name)";
type DbTask = Omit<TodoTask, "clientName"> & {
  clients: { name: string } | { name: string }[] | null;
};
function taskRow(row: DbTask): TodoTask {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    start_date: row.start_date,
    client_id: row.client_id,
    is_personal: row.is_personal,
    updated_at: row.updated_at,
    clientName:
      (Array.isArray(row.clients) ? row.clients[0] : row.clients)?.name ?? null,
  };
}
function refreshPaths() {
  revalidatePath("/my-todo");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}

async function ownedTask(id: string, userId: string) {
  if (!isUuid(id)) return null;
  const db = await createClient();
  const { data: row, error } = await db
    .from("tasks")
    .select(`${TASK_SELECT},created_by,assigned_to`)
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return null;
  if (row.is_personal) return row.created_by === userId ? row : null;
  if (row.assigned_to === userId) return row;
  const { data: assignment } = await db
    .from("task_assignees")
    .select("task_id")
    .eq("task_id", id)
    .eq("profile_id", userId)
    .maybeSingle();
  return assignment ? row : null;
}

export async function loadTodoWorkspace(): Promise<Result<TodoData>> {
  const user = await requireStaff();
  if (!user)
    return { error: "Sign in with your staff account to use My To-Do." };
  const db = await createClient();
  const [primary, assignments, clients, prefs, items] = await Promise.all([
    db
      .from("tasks")
      .select(TASK_SELECT)
      .or(
        `and(is_personal.eq.true,created_by.eq.${user.id}),and(is_personal.eq.false,assigned_to.eq.${user.id})`,
      )
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id")
      .limit(1000),
    db
      .from("task_assignees")
      .select("task_id")
      .eq("profile_id", user.id)
      .limit(1000),
    db.from("clients").select("id,name").order("name").limit(1000),
    db
      .from("my_todo_workspaces")
      .select("preferences")
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("my_todo_item_state")
      .select("item_key,planned_on,position,snoozed_until")
      .eq("user_id", user.id)
      .order("planned_on", { ascending: false, nullsFirst: false })
      .limit(1000),
  ]);
  if (primary.error || assignments.error || clients.error)
    return { error: "Couldn't load your tasks. Refresh to try again." };
  const ids = (assignments.data ?? [])
    .map((r: { task_id: string }) => r.task_id)
    .filter(
      (id: string) =>
        !(primary.data ?? []).some((t: { id: string }) => t.id === id),
    );
  const secondary = ids.length
    ? await db
        .from("tasks")
        .select(TASK_SELECT)
        .eq("is_personal", false)
        .in("id", ids)
    : { data: [], error: null };
  if (secondary.error)
    return {
      error: "Couldn't load secondary task assignments. Refresh to try again.",
    };
  return {
    data: {
      today: new Date().toISOString().slice(0, 10),
      tasks: [...(primary.data ?? []), ...(secondary.data ?? [])].map(taskRow),
      clients: clients.data ?? [],
      preferences: normalizePreferences(prefs.data?.preferences),
      items: items.data ?? [],
      warning:
        prefs.error || items.error
          ? "Personal workspace settings are temporarily unavailable. Changes may not save; your tasks are unaffected."
          : null,
      truncated:
        (primary.data?.length ?? 0) >= 1000 ||
        (assignments.data?.length ?? 0) >= 1000,
    },
  };
}

export async function saveTodoPreferences(
  value: TodoPreferences,
): Promise<Result<TodoPreferences>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  const preferences = normalizePreferences(value);
  const db = await createClient();
  const { error } = await db
    .from("my_todo_workspaces")
    .upsert({ user_id: user.id, preferences }, { onConflict: "user_id" });
  return error
    ? { error: "Couldn't save your preferences. Please try again." }
    : { data: preferences };
}

export async function planTodoItem(
  key: string,
  date: string | null,
  position = 0,
  snooze: string | null = null,
): Promise<Result<ItemState>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  if (
    typeof key !== "string" ||
    key.length > 1200 ||
    !Number.isInteger(position) ||
    Math.abs(position) > 1000000 ||
    (date !== null && !isDate(date)) ||
    (snooze !== null && !isDate(snooze))
  )
    return { error: "Invalid planning settings." };
  const db = await createClient();
  if (key.startsWith("task:")) {
    if (!(await ownedTask(key.slice(5), user.id)))
      return { error: "This task is no longer available to you." };
  } else if (key.startsWith("ticket:")) {
    const id = Number(key.slice(7));
    if (!Number.isSafeInteger(id) || id <= 0)
      return { error: "Invalid ticket." };
    const result = await loadTodoTickets();
    if ("error" in result) return result;
    if (!result.tickets.some((t) => t.id === id))
      return { error: "This ticket is no longer assigned to you." };
  } else if (key.startsWith("mail:")) {
    const { data } = await db
      .from("mailbox_snapshot_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("graph_message_id", key.slice(5))
      .limit(1)
      .maybeSingle();
    if (!data) return { error: "This message is no longer available." };
  } else return { error: "Unknown item type." };
  const item = {
    item_key: key,
    planned_on: date,
    position,
    snoozed_until: snooze,
  };
  const { error } = await db
    .from("my_todo_item_state")
    .upsert({ user_id: user.id, ...item }, { onConflict: "user_id,item_key" });
  return error
    ? { error: "Couldn't save this plan. Please try again." }
    : { data: item };
}

export async function createTodoTask(
  value: TaskDraft,
  source?: { conversationId: string; messageId: string },
): Promise<Result<TodoTask>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  const draft = validateDraft(value);
  if (draft.error !== undefined) return { error: draft.error };
  const db = await createClient();
  if (draft.data.client_id) {
    const { data: client } = await db
      .from("clients")
      .select("id")
      .eq("id", draft.data.client_id)
      .maybeSingle();
    if (!client) return { error: "That client is no longer available." };
  }
  let id: string;
  if (source) {
    if (
      typeof source.conversationId !== "string" ||
      !source.conversationId ||
      source.conversationId.length > 1000 ||
      typeof source.messageId !== "string" ||
      !source.messageId ||
      source.messageId.length > 1000
    )
      return { error: "Invalid source message." };
    const { data, error } = await db.rpc("create_my_todo_mail_task", {
      p_conversation: source.conversationId,
      p_message: source.messageId,
      p_title: draft.data.title,
      p_detail: draft.data.detail,
      p_priority: draft.data.priority,
      p_due: draft.data.due_date,
      p_client: draft.data.client_id,
    });
    if (error || !data)
      return {
        error:
          "Couldn't create the private task. The source may have expired; refresh Inbox and retry.",
      };
    id = data;
  } else {
    const { data, error } = await db
      .from("tasks")
      .insert({
        ...draft.data,
        detail: draft.data.detail || null,
        is_personal: true,
        created_by: user.id,
        kind: "general",
        status: "open",
        start_date: null,
      })
      .select("id")
      .single();
    if (error || !data)
      return { error: "Couldn't create the task. Your draft has been kept." };
    id = data.id;
  }
  const row = await ownedTask(id, user.id);
  if (!row)
    return {
      error: "Task saved, but couldn't be loaded. Refresh before trying again.",
    };
  refreshPaths();
  return { data: taskRow(row) };
}

export async function updateTodoTask(
  id: string,
  patch: Partial<TaskDraft> & { status?: TaskStatus },
  expectedUpdatedAt: string,
): Promise<Result<TodoTask>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  const row = await ownedTask(id, user.id);
  if (!row) return { error: "This task is no longer available to you." };
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    typeof expectedUpdatedAt !== "string"
  )
    return { error: "Invalid task change." };
  const allowed = [
    "title",
    "detail",
    "priority",
    "due_date",
    "client_id",
    "status",
  ];
  if (Object.keys(patch).some((key) => !allowed.includes(key)))
    return { error: "This field cannot be changed here." };
  if (patch.status !== undefined && !Object.hasOwn(TASK_STATUSES, patch.status))
    return { error: "Choose a valid status." };
  const valid = validateDraft({ ...row, ...patch });
  if (valid.error !== undefined) return { error: valid.error };
  const db = await createClient();
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(patch))
    changes[key] =
      key === "status" ? patch.status : valid.data[key as keyof TaskDraft];
  if (patch.status !== undefined)
    changes.completed_at =
      patch.status === "done" ? new Date().toISOString() : null;
  const { data, error } = await db
    .from("tasks")
    .update(changes)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(TASK_SELECT)
    .maybeSingle();
  if (error)
    return { error: "Couldn't save this task. Your changes have been kept." };
  if (!data)
    return {
      error: "This task changed elsewhere. Refresh before saving again.",
    };
  refreshPaths();
  return { data: taskRow(data) };
}

export async function loadTodoInbox(): Promise<Result<InboxData>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  const admin = createAdminClient();
  const db = await createClient();
  const { data: connection, error } = await admin
    .from("mail_connections")
    .select(
      "mailbox_email,snapshot_synced_at,review_lookback_days,review_excludes,sync_excluded_senders",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { error: "Couldn't load mailbox settings." };
  const preferences = {
    days: connection?.review_lookback_days ?? 30,
    excludes: connection?.review_excludes ?? "",
    neverStore: connection?.sync_excluded_senders ?? "",
  };
  if (!connection)
    return {
      data: {
        connected: false,
        threads: [],
        syncedAt: null,
        truncated: false,
        preferences,
      },
    };
  const since = new Date(
    Date.now() - Math.max(1, Math.min(90, preferences.days)) * 86400000,
  ).toISOString();
  const [messages, dismissed, links] = await Promise.all([
    db
      .from("mailbox_snapshot_messages")
      .select(
        "conversation_id,graph_message_id,subject,from_name,from_email,to_name,to_email,received_at,web_link,body_preview",
      )
      .eq("user_id", user.id)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(1000),
    db
      .from("dismissed_mailbox_threads")
      .select("conversation_id,dismissed_message_id")
      .eq("user_id", user.id),
    db
      .from("my_todo_mail_tasks")
      .select("conversation_id,task_id")
      .eq("user_id", user.id),
  ]);
  if (messages.error || dismissed.error || links.error)
    return { error: "Couldn't load your mailbox review. Please refresh." };
  const dismissal = new Map<string, string>(
    (dismissed.data ?? []).map(
      (r: { conversation_id: string; dismissed_message_id: string }) => [
        r.conversation_id,
        r.dismissed_message_id,
      ],
    ),
  );
  const taskLinks = new Map<string, string>(
    (links.data ?? []).map(
      (r: { conversation_id: string; task_id: string }) => [
        r.conversation_id,
        r.task_id,
      ],
    ),
  );
  const threads = new Map<string, MailThread>();
  const excludes = preferences.excludes
    .toLowerCase()
    .split(/[,\n]/)
    .map((s: string) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  for (const m of messages.data ?? []) {
    if (seen.has(m.conversation_id)) continue;
    seen.add(m.conversation_id);
    const sent =
      m.from_email?.toLowerCase() === connection.mailbox_email.toLowerCase();
    const haystack =
      `${m.from_email ?? ""} ${m.from_name ?? ""} ${m.subject ?? ""}`.toLowerCase();
    if (excludes.some((term: string) => haystack.includes(term))) continue;
    threads.set(m.conversation_id, {
      conversationId: m.conversation_id,
      messageId: m.graph_message_id,
      subject: m.subject || "(No subject)",
      contact: sent
        ? m.to_name || m.to_email || "Recipient"
        : m.from_name || m.from_email || "Sender",
      preview: m.body_preview ?? "",
      webLink: m.web_link,
      receivedAt: m.received_at,
      direction: sent ? "sent" : "received",
      dismissed: dismissal.get(m.conversation_id) === m.graph_message_id,
      taskId: taskLinks.get(m.conversation_id) ?? null,
    });
  }
  return {
    data: {
      connected: true,
      threads: [...threads.values()],
      syncedAt: connection.snapshot_synced_at,
      truncated: (messages.data?.length ?? 0) >= 1000,
      preferences,
    },
  };
}

export async function reviewTodoInbox(form: FormData) {
  if (!(await requireStaff())) return { error: "Not signed in.", result: null };
  return reviewMyMailbox({ error: null, result: null }, form);
}
export async function syncTodoInbox() {
  if (!(await requireStaff())) return { error: "Not signed in." };
  return syncMyMailboxNow();
}
export async function dismissTodoThread(
  conversationId: string,
  messageId: string,
  dismissed: boolean,
): Promise<Result<null>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  if (
    typeof conversationId !== "string" ||
    conversationId.length > 1000 ||
    typeof messageId !== "string" ||
    messageId.length > 1000 ||
    typeof dismissed !== "boolean"
  )
    return { error: "Invalid message." };
  const db = await createClient();
  const { data } = await db
    .from("mailbox_snapshot_messages")
    .select("id")
    .eq("user_id", user.id)
    .eq("conversation_id", conversationId)
    .eq("graph_message_id", messageId)
    .maybeSingle();
  if (!data) return { error: "This message is no longer available." };
  const result = dismissed
    ? await db.from("dismissed_mailbox_threads").upsert(
        {
          user_id: user.id,
          conversation_id: conversationId,
          dismissed_message_id: messageId,
          dismissed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,conversation_id" },
      )
    : await db
        .from("dismissed_mailbox_threads")
        .delete()
        .eq("user_id", user.id)
        .eq("conversation_id", conversationId)
        .eq("dismissed_message_id", messageId);
  return result.error
    ? { error: "Couldn't update this thread." }
    : { data: null };
}
export async function loadTodoTickets() {
  try {
    return await fetchMyOpenTicketsAction();
  } catch {
    return { error: "Couldn't reach Autotask. Retry in a moment." };
  }
}
export async function loadTodoAgenda() {
  if (!(await requireStaff())) return { error: "Not signed in." };
  try {
    return await fetchMyUpcomingAppointments();
  } catch {
    return { error: "Couldn't reach your calendar. Retry in a moment." };
  }
}

export async function loadTodoTime(month: string): Promise<Result<TimeData>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  if (!/^\d{4}-\d{2}$/.test(month) || !isDate(month + "-01"))
    return { error: "Choose a valid month." };
  const db = await createClient();
  const permissions = await getMyPermissions(db);
  const isOwner = permissions?.role === "owner";
  const admin = createAdminClient();
  const [year, number] = month.split("-").map(Number);
  const end = `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`;
  let hoursQuery = admin
    .from("logged_hours")
    .select("id,user_id,work_date,hours,label,profiles:user_id(full_name)")
    .gte("work_date", month + "-01")
    .lte("work_date", end)
    .order("work_date");
  if (!isOwner) hoursQuery = hoursQuery.eq("user_id", user.id);
  const [hours, absences, requestCheck] = await Promise.all([
    hoursQuery,
    admin
      .from("time_off_requests")
      .select("id,user_id,start_date,end_date,profiles:user_id(full_name)")
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", month + "-01"),
    admin
      .from("time_off_requests")
      .select("id")
      .eq("user_id", user.id)
      .limit(1),
  ]);
  if (hours.error || absences.error || requestCheck.error)
    return { error: "Couldn't load time and leave. Refresh to try again." };
  const requests = await fetchTimeOffRequests(
    isOwner ? { strict: true } : { userId: user.id, strict: true },
    admin,
  );
  const entries = (hours.data ?? []).map(
    (r: {
      id: string;
      user_id: string;
      work_date: string;
      hours: number;
      label: HoursEntry["label"];
      profiles: unknown;
    }) => ({
      ...r,
      hours: Number(r.hours),
      userName:
        (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.full_name ??
        "Staff member",
    }),
  );
  return {
    data: {
      hours: entries.filter((e: { user_id: string }) => e.user_id === user.id),
      teamHours: isOwner ? entries : [],
      requests: requests.filter((r) => r.userId === user.id),
      teamRequests: isOwner ? requests.filter((r) => r.userId !== user.id) : [],
      absences: (absences.data ?? [])
        .filter((r: { user_id: string }) => r.user_id !== user.id)
        .map(
          (r: {
            id: string;
            start_date: string;
            end_date: string;
            profiles: unknown;
          }) => ({
            id: r.id,
            name:
              (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)
                ?.full_name ?? "Staff member",
            start: r.start_date,
            end: r.end_date,
          }),
        ),
      isOwner,
      userId: user.id,
    },
  };
}
export async function saveTodoHours(
  date: string,
  label: HoursEntry["label"],
  hours: number,
): Promise<Result<null>> {
  const user = await requireStaff();
  if (!user) return { error: "Not signed in." };
  if (
    !isDate(date) ||
    !["regular", "after_hours", "taken_off"].includes(label) ||
    !Number.isFinite(hours) ||
    hours < 0 ||
    hours > 24
  )
    return { error: "Choose a valid date, category and hours from 0 to 24." };
  const db = await createClient();
  const rounded = Math.round(hours * 100) / 100;
  const { error } =
    rounded === 0
      ? await db
          .from("logged_hours")
          .delete()
          .eq("user_id", user.id)
          .eq("work_date", date)
          .eq("label", label)
      : await db
          .from("logged_hours")
          .upsert(
            { user_id: user.id, work_date: date, label, hours: rounded },
            { onConflict: "user_id,work_date,label" },
          );
  if (error)
    return { error: "Couldn't save these hours. Your entry has been kept." };
  revalidatePath("/my-todo");
  return { data: null };
}
export async function createTodoLeave(form: FormData) {
  if (!(await requireStaff())) return { error: "Not signed in." };
  if (!isDate(form.get("start_date")) || !isDate(form.get("end_date")))
    return { error: "Choose valid dates." };
  return createTimeOffRequestAction({ error: null }, form);
}
export async function decideTodoLeave(
  id: string,
  decision: "approved" | "declined",
) {
  if (!isUuid(id) || !["approved", "declined"].includes(decision))
    return { error: "Invalid request." };
  const db = await createClient();
  if ((await getMyPermissions(db))?.role !== "owner")
    return { error: "Only an owner can decide leave requests." };
  await decideTimeOffRequestAction(id, decision);
  const { data, error } = await db
    .from("time_off_requests")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  return error || data?.status !== decision
    ? {
        error:
          "The request changed or couldn't be saved. Refresh to check its status.",
      }
    : { error: null };
}
export async function withdrawTodoLeave(id: string) {
  const user = await requireStaff();
  if (!user || !isUuid(id)) return { error: "Invalid request." };
  const db = await createClient();
  const { data } = await db
    .from("time_off_requests")
    .select("id,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || data.status !== "pending")
    return { error: "Only your pending requests can be withdrawn." };
  await withdrawTimeOffRequestAction(id);
  const { data: remaining, error } = await db
    .from("time_off_requests")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  return error || remaining
    ? { error: "Couldn't withdraw the request. Refresh and retry." }
    : { error: null };
}
export async function addTodoLeaveNote(form: FormData) {
  return addTimeOffNoteAction({ error: null }, form);
}

export async function loadTodoNotes(id: string) {
  const user = await requireStaff();
  if (!user || !(await ownedTask(id, user.id)))
    return { error: "This task is no longer available to you." };
  const result = await getTaskNotesAction(id);
  return "error" in result
    ? { error: "Couldn't load task discussion." }
    : { data: result.notes };
}
export async function addTodoNote(
  id: string,
  body: string,
): Promise<Result<null>> {
  const user = await requireStaff();
  if (!user || !(await ownedTask(id, user.id)))
    return { error: "This task is no longer available to you." };
  if (typeof body !== "string" || !body.trim() || body.length > 10000)
    return { error: "Enter a note of up to 10,000 characters." };
  const form = new FormData();
  form.set("body", body.trim());
  const result = await addTaskNote(id, { error: null }, form);
  return result.error
    ? { error: "Couldn't save your note. Your draft has been kept." }
    : { data: null };
}
