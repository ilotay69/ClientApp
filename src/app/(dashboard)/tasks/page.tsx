import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { TaskAssigneesSelect } from "@/components/task-assignees-select";
import { InlineTextEdit, InlineDateEdit, InlineSelectEdit } from "@/components/task-field-editor";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { isOverdue } from "@/lib/format";
import { createTask, setTaskAssignees, updateTaskField, updateTaskStatus } from "./actions";

export const dynamic = "force-dynamic";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

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

  const [{ data: clients }, { data: members }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  const clientOptions = [{ value: "", label: "No client (internal)" }].concat(
    (clients ?? []).map((c) => ({ value: c.id, label: c.name }))
  );

  const assigneesRelation =
    mine === "1" && user ? "task_assignees!inner(profile_id)" : "task_assignees(profile_id)";

  let query = supabase
    .from("tasks")
    .select(
      `id, kind, title, detail, status, priority, start_date, due_date, client_id, clients(name), ${assigneesRelation}`
    )
    .order("due_date", { ascending: true, nullsFirst: false });

  if (view !== "all") {
    query = query.in("status", ["open", "in_progress"]);
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
            All (incl. done)
          </FilterLink>
        </div>
      </div>

      <TaskQuickAdd clients={clients ?? []} members={members ?? []} action={createTask} />

      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Task</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Client</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Assigned to</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Priority</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Start</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Due</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
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
                    <Badge value={t.status} />
                  </td>
                  <td className="px-5 py-3 align-top">
                    {t.status !== "done" && t.status !== "dismissed" ? (
                      <div className="flex justify-end gap-2">
                        <form action={updateTaskStatus.bind(null, t.id, "done")}>
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            Done
                          </button>
                        </form>
                        <form action={updateTaskStatus.bind(null, t.id, "dismissed")}>
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                          >
                            Dismiss
                          </button>
                        </form>
                      </div>
                    ) : (
                      <form action={updateTaskStatus.bind(null, t.id, "open")} className="flex justify-end">
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          Reopen
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(tasks ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-slate-500">
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
        active ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </Link>
  );
}
