import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { Tabs } from "@/components/tabs";
import { hasPermission } from "@/lib/permissions";
import { createTask, deleteTask, setTaskAssignees, updateTaskField } from "./actions";
import { FilterLink } from "@/components/filter-link";

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

// Personal to-dos don't carry "done"/"dismissed" legacy baggage — they're
// a new field — so no fallback needed there.
const PERSONAL_STATUS_OPTIONS = [
  ...STATUS_OPTIONS,
  { value: "done", label: "Done" },
  { value: "dismissed", label: "Dismissed" },
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

  const [{ data: clients }, { data: members }, canDeleteTasks, { data: projects }] =
    await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      hasPermission(supabase, "delete_tasks"),
      supabase.from("projects").select("id, name, clients(name)").order("name"),
    ]);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const clientOptions = [{ value: "", label: "No client (internal)" }].concat(
    (clients ?? []).map((c) => ({ value: c.id, label: c.name }))
  );
  const projectSummaries = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: (p.clients as unknown as { name: string } | null)?.name ?? null,
  }));
  const projectById = new Map(projectSummaries.map((p) => [p.id, p]));
  const projectOptions = [{ value: "", label: "No project" }].concat(
    projectSummaries.map((p) => ({
      value: p.id,
      label: p.clientName ? `${p.name} — ${p.clientName}` : p.name,
    }))
  );
  const memberById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  const assigneesRelation =
    mine === "1" && user ? "task_assignees!inner(profile_id)" : "task_assignees(profile_id)";

  let teamQuery = supabase
    .from("tasks")
    .select(
      `id, kind, title, detail, notes, status, priority, start_date, due_date, client_id, project_id, is_personal, ${assigneesRelation}`
    )
    .eq("is_personal", false)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (view !== "all") {
    teamQuery = teamQuery.not("status", "in", "(done,dismissed)");
  }
  if (mine === "1" && user) {
    teamQuery = teamQuery.eq("task_assignees.profile_id", user.id);
  }

  const [{ data: teamTasks }, { data: personalTasks }] = await Promise.all([
    teamQuery,
    // RLS already restricts personal rows to their creator — this filter
    // just keeps the query's intent explicit.
    supabase
      .from("tasks")
      .select("id, kind, title, detail, notes, status, priority, start_date, due_date, is_personal")
      .eq("is_personal", true)
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  const updateFieldAction = updateTaskField;
  const setAssigneesAction = setTaskAssignees;

  const teamTasksList = (
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
        {(teamTasks ?? []).map((t) => {
          const assigneeIds = (
            (t.task_assignees as unknown as { profile_id: string }[] | null) ?? []
          ).map((a) => a.profile_id);
          const assigneeNames = assigneeIds
            .map((id) => memberById.get(id))
            .filter((n): n is string => Boolean(n))
            .join(", ");
          const project = t.project_id ? projectById.get(t.project_id) : null;

          return (
            <TaskRow
              key={t.id}
              task={t as TaskRowData}
              clientName={t.client_id ? (clientById.get(t.client_id) ?? null) : null}
              projectLabel={project ? project.name : null}
              assigneeIds={assigneeIds}
              assigneeNames={assigneeNames}
              clientOptions={clientOptions}
              projectOptions={projectOptions}
              members={members ?? []}
              canDelete={canDeleteTasks}
              statusOptions={statusOptionsFor(t.status)}
              priorityOptions={PRIORITY_OPTIONS}
              updateFieldAction={updateFieldAction}
              setAssigneesAction={setAssigneesAction}
              deleteAction={deleteTask.bind(null, t.id)}
            />
          );
        })}
        {(teamTasks ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-slate-500">
            Nothing here. Add a task above, or promote an insight from the{" "}
            <Link href="/dashboard" className="underline">
              dashboard
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );

  const myToDoList = (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My To-Do</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your own list — only you can see or edit these, whether or not
          they&apos;re tied to work in this app.
        </p>
      </div>

      <TaskQuickAdd
        clients={clients ?? []}
        projects={projectSummaries}
        members={members ?? []}
        action={createTask}
        personal
      />

      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        {(personalTasks ?? []).map((t) => (
          <TaskRow
            key={t.id}
            task={{ ...t, client_id: null, project_id: null } as TaskRowData}
            clientName={null}
            projectLabel={null}
            assigneeIds={[]}
            assigneeNames=""
            clientOptions={clientOptions}
            projectOptions={projectOptions}
            members={members ?? []}
            canDelete
            statusOptions={PERSONAL_STATUS_OPTIONS}
            priorityOptions={PRIORITY_OPTIONS}
            updateFieldAction={updateFieldAction}
            setAssigneesAction={setAssigneesAction}
            deleteAction={deleteTask.bind(null, t.id)}
          />
        ))}
        {(personalTasks ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-slate-500">
            Nothing on your list yet. Add one above.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Tabs
      tabs={[
        { label: "Team Tasks", content: teamTasksList },
        { label: "My To-Do", content: myToDoList },
      ]}
    />
  );
}
