import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { AssigneeSelect } from "@/components/assignee-select";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { formatDate, isOverdue } from "@/lib/format";
import { assignTask, createTask, updateTaskStatus } from "./actions";

export const dynamic = "force-dynamic";

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

  let query = supabase
    .from("tasks")
    .select("id, kind, title, detail, status, due_date, assigned_to, clients(name)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (view !== "all") {
    query = query.in("status", ["open", "in_progress"]);
  }
  if (mine === "1" && user) {
    query = query.eq("assigned_to", user.id);
  }

  const { data: tasks } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything that&apos;s been flagged or scheduled, assigned to a
            specific person.
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Task</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Client</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Assigned to</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Due</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Status</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(tasks ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Badge value={t.kind} />
                    <div>
                      <p className="font-medium text-slate-900">{t.title}</p>
                      {t.detail && <p className="text-xs text-slate-500">{t.detail}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {(t.clients as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-5 py-3">
                  <AssigneeSelect
                    id={t.id}
                    currentAssignee={t.assigned_to}
                    members={members ?? []}
                    action={assignTask}
                  />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">{formatDate(t.due_date)}</span>
                    {t.status !== "done" && t.status !== "dismissed" && isOverdue(t.due_date) && (
                      <OverdueBadge />
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge value={t.status} />
                </td>
                <td className="px-5 py-3">
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
            ))}
            {(tasks ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
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
