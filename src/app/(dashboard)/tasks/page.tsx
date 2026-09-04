import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { TaskFilterBar } from "@/components/task-filter-bar";
import { Tabs } from "@/components/tabs";
import { hasPermission } from "@/lib/permissions";
import { createTask, deleteTask, setTaskAssignees, updateTaskField } from "./actions";
import { FilterLink, filterHref } from "@/components/filter-link";

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
  { value: "done", label: "Done" },
  { value: "dismissed", label: "Dismissed" },
];

// A task created before this status list changed may still carry some
// other legacy value — fall it into the picker so the select shows the
// real current value instead of silently mismatching.
function statusOptionsFor(current: string) {
  if (STATUS_OPTIONS.some((o) => o.value === current)) return STATUS_OPTIONS;
  return [...STATUS_OPTIONS, { value: current, label: current }];
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    mine?: string;
    view?: string;
    project_id?: string;
    client_id?: string;
    client?: string;
    priority?: string;
    assignee?: string;
    status?: string;
  }>;
}) {
  const {
    mine,
    view,
    project_id: defaultProjectId,
    client_id: defaultClientId,
    client: filterClient,
    priority: filterPriority,
    assignee: filterAssignee,
    status: filterStatus,
  } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: clients },
    { data: members },
    canDeleteTasks,
    { data: projects },
    { data: taskClientRows },
  ] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    hasPermission(supabase, "delete_tasks"),
    supabase.from("projects").select("id, name, clients(name)").order("name"),
    // Unfiltered, so the client filter's own options don't shrink as other
    // filters (priority, assignee, status, mine/view) are applied.
    supabase.from("tasks").select("client_id").eq("is_personal", false).not("client_id", "is", null),
  ]);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const clientOptions = [{ value: "", label: "No client (internal)" }].concat(
    (clients ?? []).map((c) => ({ value: c.id, label: c.name }))
  );
  const taskClientIds = new Set((taskClientRows ?? []).map((r) => r.client_id));
  const filterClients = (clients ?? []).filter((c) => taskClientIds.has(c.id));
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
  const memberById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  // "My tasks" is really just the assignee filter defaulting to the
  // current user — an explicit assignee filter takes precedence if both
  // are somehow present at once.
  const effectiveAssigneeId = filterAssignee || (mine === "1" && user ? user.id : "");

  const assigneesRelation = effectiveAssigneeId
    ? "task_assignees!inner(profile_id)"
    : "task_assignees(profile_id)";

  let teamQuery = supabase
    .from("tasks")
    .select(
      `id, kind, title, detail, notes, status, priority, start_date, due_date, client_id, project_id, is_personal, ${assigneesRelation}`
    )
    .eq("is_personal", false)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (filterStatus) {
    // An explicit status filter (e.g. "Done") overrides the default
    // open-only view — picking "Done" should show done tasks regardless
    // of the Open/All chip.
    teamQuery = teamQuery.eq("status", filterStatus);
  } else if (view !== "all") {
    teamQuery = teamQuery.not("status", "in", "(done,dismissed)");
  }
  if (effectiveAssigneeId) {
    teamQuery = teamQuery.eq("task_assignees.profile_id", effectiveAssigneeId);
  }
  if (filterClient) {
    teamQuery = teamQuery.eq("client_id", filterClient);
  }
  if (filterPriority) {
    teamQuery = teamQuery.eq("priority", filterPriority);
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

      <TaskFilterBar
        clients={filterClients}
        members={members ?? []}
        priorityOptions={PRIORITY_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        values={{
          client: filterClient ?? "",
          priority: filterPriority ?? "",
          assignee: filterAssignee ?? "",
          status: filterStatus ?? "",
        }}
        preserve={{ mine, view }}
        clearHref={filterHref("/tasks", { mine, view })}
      />

      <TaskQuickAdd
        clients={clients ?? []}
        projects={projectSummaries}
        members={members ?? []}
        action={createTask}
        defaultProjectId={defaultProjectId ?? ""}
        defaultClientId={defaultClientId ?? ""}
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

          return (
            <TaskRow
              key={t.id}
              task={t as TaskRowData}
              clientName={t.client_id ? (clientById.get(t.client_id) ?? null) : null}
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
            assigneeIds={[]}
            assigneeNames=""
            clientOptions={clientOptions}
            projectOptions={projectOptions}
            members={members ?? []}
            canDelete
            statusOptions={statusOptionsFor(t.status)}
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
