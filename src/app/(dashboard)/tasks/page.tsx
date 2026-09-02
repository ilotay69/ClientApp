import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { DeleteButton } from "@/components/delete-button";
import { TaskAssigneesSelect } from "@/components/task-assignees-select";
import { InlineTextEdit, InlineDateEdit, InlineSelectEdit } from "@/components/task-field-editor";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { isOverdue } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { createTask, deleteTask, setTaskAssignees, updateTaskField } from "./actions";

export const dynamic = "force-dynamic";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "waiting_client", label: "Waiting Client" },
];

// A task created before this status rework may still carry a legacy
// 'done'/'dismissed' value — fall it into the picker so the select shows
// the real current value instead of silently mismatching.
function statusOptionsFor(current: string) {
  if (STATUS_OPTIONS.some((o) => o.value === current)) return STATUS_OPTIONS;
  return [...STATUS_OPTIONS, { value: current, label: current }];
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string; view?: string }>;
}) {
  const { mine, view } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: clients }, { data: members }, canDeleteTasks, { data: projects }] =
    await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      hasPermission(supabase, "delete_tasks"),
      supabase.from("projects").select("id, name, clients(name)").order("name"),
    ]);
  const clientOptions = [{ value: "", label: "No client (internal)" }].concat(
    (clients ?? []).map((c) => ({ value: c.id, label: c.name }))
  );
  const projectSummaries = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: (p.clients as unknown as { name: string } | null)?.name ?? null,
  }));
  const projectOptions = [{ value: "", label: "No project" }].concat(
    projectSummaries.map((p) => ({
      value: p.id,
      label: p.clientName ? `${p.name} — ${p.clientName}` : p.name,
    }))
  );

  const assigneesRelation =
    mine === "1" && user ? "task_assignees!inner(profile_id)" : "task_assignees(profile_id)";

  let query = supabase
    .from("tasks")
    .select(
      `id, kind, title, detail, notes, status, priority, start_date, due_date, client_id, project_id, clients(name), ${assigneesRelation}`
    )
    .order("due_date", { ascending: true, nullsFirst: false });

  if (view !== "all") {
    query = query.not("status", "in", "(done,dismissed)");
  }
  if (mine === "1" && user) {
    query = query.eq("task_assignees.profile_id", user.id);
  }

  const { data: tasks } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything that&apos;s been flagged or scheduled, assigned to
            whoever&apos;s working it.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <FilterLink href="/tasks" active={!mine && view !== "all"}>
            Open
          </FilterLink>
          <FilterLink href="/tasks?mine=1" active={mine === "1"}>
            My tasks
          </FilterLink>
          <FilterLink href="/tasks?view=all" active={view === "all" && !mine}>
            All
          </FilterLink>
        </div>
      </div>

      <TaskQuickAdd
        clients={clients ?? []}
        projects={projectSummaries}
        members={members ?? []}
        action={createTask}
      />

      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Task</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Client</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Project</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Assigned to</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Priority</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Start</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Due</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Notes</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(tasks ?? []).map((t) => {
              const assigneeIds = (
                (t.task_assignees as unknown as { profile_id: string }[] | null) ?? []
              ).map((a) => a.profile_id);
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 align-top">
                    <div className="flex items-start gap-2">
                      <Badge value={t.kind} />
                      <div className="min-w-[10rem] flex-1">
                        <InlineTextEdit
                          taskId={t.id}
                          field="title"
                          value={t.title}
                          action={updateTaskField}
                        />
                        <InlineTextEdit
                          taskId={t.id}
                          field="detail"
                          value={t.detail ?? ""}
                          action={updateTaskField}
                          placeholder="Add detail..."
                          emptyLabel="Add detail"
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 align-top text-slate-600">
                    <InlineSelectEdit
                      taskId={t.id}
                      field="client_id"
                      value={t.client_id ?? ""}
                      action={updateTaskField}
                      options={clientOptions}
                    />
                  </td>
                  <td className="px-5 py-3 align-top text-slate-600">
                    <InlineSelectEdit
                      taskId={t.id}
                      field="project_id"
                      value={t.project_id ?? ""}
                      action={updateTaskField}
                      options={projectOptions}
                    />
                  </td>
                  <td className="px-5 py-3 align-top">
                    <TaskAssigneesSelect
                      id={t.id}
                      currentAssigneeIds={assigneeIds}
                      members={members ?? []}
                      action={setTaskAssignees}
                    />
                  </td>
                  <td className="px-5 py-3 align-top">
                    <InlineSelectEdit
                      taskId={t.id}
                      field="priority"
                      value={t.priority}
                      action={updateTaskField}
                      options={PRIORITY_OPTIONS}
                    />
                  </td>
                  <td className="px-5 py-3 align-top">
                    <InlineDateEdit
                      taskId={t.id}
                      field="start_date"
                      value={t.start_date ?? ""}
                      action={updateTaskField}
                    />
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <InlineDateEdit
                        taskId={t.id}
                        field="due_date"
                        value={t.due_date ?? ""}
                        action={updateTaskField}
                      />
                      {t.status !== "done" && t.status !== "dismissed" && isOverdue(t.due_date) && (
                        <OverdueBadge />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <InlineSelectEdit
                      taskId={t.id}
                      field="status"
                      value={t.status}
                      action={updateTaskField}
                      options={statusOptionsFor(t.status)}
                    />
                  </td>
                  <td className="px-5 py-3 align-top text-slate-600">
                    <InlineTextEdit
                      taskId={t.id}
                      field="notes"
                      value={t.notes ?? ""}
                      action={updateTaskField}
                      placeholder="Add notes..."
                      emptyLabel="Add notes"
                    />
                  </td>
                  <td className="px-5 py-3 align-top">
                    {canDeleteTasks && (
                      <div className="flex justify-end">
                        <DeleteButton
                          action={deleteTask.bind(null, t.id)}
                          confirmText={`Delete "${t.title}"?`}
                          label="Delete"
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {(tasks ?? []).length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-6 text-center text-slate-500">
                  Nothing here. Add a task above, or promote an insight from
                  the{" "}
                  <Link href="/dashboard" className="underline">
                    dashboard
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 ${
        active ? "bg-charcoal text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </Link>
  );
}
