"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getResendClient, buildTaskAssignedEmail } from "@/lib/resend";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/lib/permissions";
import type { TaskKind, TaskPriority } from "@/lib/types";

export type FormState = { error: string | null };

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Emails everyone newly assigned to a task. Best-effort: a missing API key
 * or send failure never blocks the assignment itself. */
async function notifyNewAssignees(taskId: string, newAssigneeIds: string[]) {
  if (newAssigneeIds.length === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: task }, { data: assigner }, { data: recipients }] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, detail, priority, due_date, clients(name)")
      .eq("id", taskId)
      .single(),
    user
      ? supabase.from("profiles").select("full_name").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("id, full_name, email").in("id", newAssigneeIds),
  ]);

  if (!task || !recipients?.length) return;

  try {
    const resend = getResendClient();
    const fromAddress =
      process.env.REMINDERS_FROM_EMAIL ?? "CG Client Tracker <reminders@example.com>";
    const clientName = (task.clients as unknown as { name: string } | null)?.name ?? null;

    await Promise.all(
      recipients.map((r) => {
        const { html, text } = buildTaskAssignedEmail(r.full_name, {
          title: task.title,
          detail: task.detail,
          clientName,
          priority: task.priority,
          dueDate: task.due_date ? formatDate(task.due_date) : null,
          assignedByName: assigner?.full_name ?? null,
        });
        return resend.emails.send({
          from: fromAddress,
          to: r.email,
          subject: `You've been assigned: ${task.title}`,
          html,
          text,
        });
      })
    );
  } catch (err) {
    console.error("Failed to send task-assigned email", err);
  }
}

export async function createTask(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const assigneeIds = formData.getAll("assignee_ids").map(String).filter(Boolean);

  // The form pre-fills start = today and due = start + 30 days, editable
  // before submit. This is a server-side fallback for the same default in
  // case either field arrives empty.
  const startDate = emptyToNull(formData.get("start_date")) ?? todayISO();
  const dueDate = emptyToNull(formData.get("due_date")) ?? addDaysISO(startDate, 30);

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      kind: String(formData.get("kind") ?? "general") as TaskKind,
      priority: String(formData.get("priority") ?? "medium") as TaskPriority,
      client_id: emptyToNull(formData.get("client_id")),
      assigned_to: assigneeIds[0] ?? null,
      start_date: startDate,
      due_date: dueDate,
      detail: emptyToNull(formData.get("detail")),
      notes: emptyToNull(formData.get("notes")),
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (assigneeIds.length > 0 && task) {
    await supabase
      .from("task_assignees")
      .insert(assigneeIds.map((profile_id) => ({ task_id: task.id, profile_id })));
    await notifyNewAssignees(task.id, assigneeIds);
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { error: null };
}

/** Replaces the full assignee set for a task and emails anyone newly added. */
export async function setTaskAssignees(taskId: string, assigneeIds: string[]) {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("task_assignees")
    .select("profile_id")
    .eq("task_id", taskId);

  const currentIds = new Set((current ?? []).map((r) => r.profile_id));
  const newIds = assigneeIds.filter((id) => !currentIds.has(id));

  await supabase.from("task_assignees").delete().eq("task_id", taskId);
  if (assigneeIds.length > 0) {
    await supabase
      .from("task_assignees")
      .insert(assigneeIds.map((profile_id) => ({ task_id: taskId, profile_id })));
  }
  await supabase
    .from("tasks")
    .update({ assigned_to: assigneeIds[0] ?? null })
    .eq("id", taskId);

  await notifyNewAssignees(taskId, newIds);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

const EDITABLE_TASK_FIELDS = [
  "title",
  "detail",
  "notes",
  "client_id",
  "kind",
  "priority",
  "status",
  "start_date",
  "due_date",
] as const satisfies readonly string[];

const NULLABLE_TASK_FIELDS: readonly string[] = [
  "detail",
  "notes",
  "client_id",
  "start_date",
  "due_date",
];

/** Inline-edit handler for the Tasks table — one column at a time. `field`
 * is typed as plain `string` (not the narrower union) so this matches the
 * generic `action` prop shape the editor components expect. */
export async function updateTaskField(taskId: string, field: string, value: string) {
  if (!(EDITABLE_TASK_FIELDS as readonly string[]).includes(field)) return;
  const supabase = await createClient();

  const nextValue = NULLABLE_TASK_FIELDS.includes(field) ? value.trim() || null : value;

  if (field === "title" && !String(nextValue ?? "").trim()) return;

  await supabase
    .from("tasks")
    .update({ [field]: nextValue })
    .eq("id", taskId);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteTask(taskId: string) {
  if (!(await requirePermission("delete_tasks"))) return;

  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", taskId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
