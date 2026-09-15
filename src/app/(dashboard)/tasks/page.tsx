import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { TaskFilterBar, NO_PROJECT_FILTER_VALUE } from "@/components/task-filter-bar";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import { hasPermission } from "@/lib/permissions";
import {
  createTask,
  deleteTask,
  updateTaskField,
  setTaskAssignees,
  getTaskNotesAction,
  addTaskNote,
} from "./actions";
import { FilterLink, filterHref } from "@/components/filter-link";

export const dynamic = "force-dynamic";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "waiting_client", label: "Waiting Client" },
  { value: "done", label: "Done" },
];

// A task created before this status list changed may still carry some
// other legacy value — fall it into the picker so the select shows the
// real current value instead of silently mismatching.
function statusOptionsFor(current: string) {
  if (STATUS_OPTIONS.some((o) => o.value === current)) return STATUS_OPTIONS;
  return [...STATUS_OPTIONS, { value: current, label: current }];
}

// Keeps a long project name from pushing the rest of the row around —
// this is just a scan-friendly label, not the only place the full name
// is available (the project's own page has that).
function truncateProjectName(name: string): string {
  return name.length > 30 ? `${name.slice(0, 30)}…` : name;
}

type SortDir = "asc" | "desc";

// Nulls (no due date, no client, no project, unassigned) sort last
// regardless of direction — a missing value isn't meaningfully "less than"
// or "greater than" a real one, and burying blanks at the bottom either
// way is more useful than having them jump to the top on a descending sort.
function compareSortValues(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function sortRows<T>(rows: T[], field: string, dir: SortDir, valueFor: (row: T, field: string) => string | null): T[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * compareSortValues(valueFor(a, field), valueFor(b, field)));
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
    project?: string;
    priority?: string | string[];
    assignee?: string;
    status?: string | string[];
    sort?: string;
    dir?: string;
  }>;
}) {
  const {
    mine,
    view,
    project_id: defaultProjectId,
    client_id: defaultClientId,
    client: filterClient,
    project: filterProject,
    priority: filterPriorityRaw,
    assignee: filterAssignee,
    status: filterStatusRaw,
    sort: rawSort,
    dir: rawDir,
  } = await searchParams;
  const teamSortField = rawSort || "due_date";
  const teamSortDir: SortDir = rawDir === "desc" ? "desc" : "asc";
  const filterStatuses = Array.isArray(filterStatusRaw)
    ? filterStatusRaw
    : filterStatusRaw
      ? [filterStatusRaw]
      : [];
  const filterPriorities = Array.isArray(filterPriorityRaw)
    ? filterPriorityRaw
    : filterPriorityRaw
      ? [filterPriorityRaw]
      : [];
  const supabase = await createClient();

  // Team Tasks (the full team-wide list) only shows for roles granted
  // view_team_tasks — everyone's own personal list lives at /my-todo
  // instead, which has no such gate.
  if (!(await hasPermission(supabase, "view_team_tasks"))) {
    redirect("/my-todo");
  }

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
    // neq("role", "client"): client-portal logins aren't staff and must
    // never appear as an assignable person here.
    supabase.from("profiles").select("id, full_name").neq("role", "client").order("full_name"),
    hasPermission(supabase, "delete_tasks"),
    supabase.from("projects").select("id, name, client_id, clients(name)").order("name"),
    // Unfiltered, so the client filter's own options don't shrink as other
    // filters (priority, assignee, status, mine/view) are applied.
    supabase.from("tasks").select("client_id").eq("is_personal", false).not("client_id", "is", null),
  ]);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const taskClientIds = new Set((taskClientRows ?? []).map((r) => r.client_id));
  const filterClients = (clients ?? []).filter((c) => taskClientIds.has(c.id));
  const projectSummaries = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.client_id,
    clientName: (p.clients as unknown as { name: string } | null)?.name ?? null,
  }));
  const memberById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const projectNameById = new Map(projectSummaries.map((p) => [p.id, truncateProjectName(p.name)]));
  const projectFilterOptions = projectSummaries.map((p) => ({ id: p.id, name: truncateProjectName(p.name) }));

  // Defaults to "my tasks": with no explicit assignee/mine/view param, a
  // logged-in tech lands on their own open tasks rather than everyone's.
  // An explicit assignee filter always wins; "All" (view=all) opts back
  // out of the current-user default so it can show everyone's.
  const defaultsToMine = mine === "1" || (mine === undefined && view !== "all");
  const effectiveAssigneeId = filterAssignee || (defaultsToMine && user ? user.id : "");

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

  if (filterStatuses.length > 0) {
    // An explicit status filter (e.g. "Done") overrides the default
    // open-only view — picking one or more statuses should show those
    // regardless of the Open/All chip.
    teamQuery = teamQuery.in("status", filterStatuses);
  } else if (view !== "all") {
    teamQuery = teamQuery.not("status", "in", "(done,dismissed)");
  }
  if (effectiveAssigneeId) {
    teamQuery = teamQuery.eq("task_assignees.profile_id", effectiveAssigneeId);
  }
  if (filterClient) {
    teamQuery = teamQuery.eq("client_id", filterClient);
  }
  if (filterProject === NO_PROJECT_FILTER_VALUE) {
    teamQuery = teamQuery.is("project_id", null);
  } else if (filterProject) {
    teamQuery = teamQuery.eq("project_id", filterProject);
  }
  if (filterPriorities.length > 0) {
    teamQuery = teamQuery.in("priority", filterPriorities);
  }

  const { data: teamTasks } = await teamQuery;

  const updateFieldAction = updateTaskField;

  const teamSortHrefFor = (field: string, dir: SortDir) =>
    filterHref("/tasks", {
      mine,
      view,
      client: filterClient,
      project: filterProject,
      priority: filterPriorities,
      assignee: filterAssignee,
      status: filterStatuses,
      sort: field,
      dir,
    });

  const teamRows = (teamTasks ?? []).map((t) => {
    const assigneeIds = ((t.task_assignees as unknown as { profile_id: string }[] | null) ?? []).map(
      (a) => a.profile_id
    );
    const assigneeNames = assigneeIds
      .map((id) => memberById.get(id))
      .filter((n): n is string => Boolean(n))
      .join(", ");
    const clientName = t.client_id ? (clientById.get(t.client_id) ?? null) : null;
    const projectLabel = t.project_id ? (projectNameById.get(t.project_id) ?? "Project") : "No Project";
    return { task: t, assigneeIds, assigneeNames, clientName, projectLabel };
  });

  const sortedTeamRows = sortRows(teamRows, teamSortField, teamSortDir, (row, field) => {
    switch (field) {
      case "title":
        return row.task.title;
      case "status":
        return row.task.status;
      case "client":
        return row.clientName;
      case "project":
        return row.projectLabel;
      case "assignee":
        return row.assigneeNames || null;
      case "due_date":
      default:
        return row.task.due_date;
    }
  });

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
          <FilterLink href="/tasks" active={view !== "all"}>
            My tasks
          </FilterLink>
          <FilterLink href="/tasks?view=all" active={view === "all"}>
            All
          </FilterLink>
        </div>
      </div>

      <TaskFilterBar
        clients={filterClients}
        members={members ?? []}
        projects={projectFilterOptions}
        showProject
        priorityOptions={PRIORITY_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        values={{
          client: filterClient ?? "",
          project: filterProject ?? "",
          priorities: filterPriorities,
          assignee: filterAssignee ?? "",
          statuses: filterStatuses,
        }}
        preserve={{ mine, view, sort: rawSort, dir: rawDir }}
        clearHref={filterHref("/tasks", { mine, view, sort: rawSort, dir: rawDir })}
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
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2">
          <SortableColumnHeader
            label="Due"
            field="due_date"
            activeField={teamSortField}
            activeDir={teamSortDir}
            hrefFor={teamSortHrefFor}
            className="w-24"
          />
          <SortableColumnHeader
            label="Client"
            field="client"
            activeField={teamSortField}
            activeDir={teamSortDir}
            hrefFor={teamSortHrefFor}
            className="w-32"
          />
          <SortableColumnHeader
            label="Project"
            field="project"
            activeField={teamSortField}
            activeDir={teamSortDir}
            hrefFor={teamSortHrefFor}
            className="w-44"
          />
          <SortableColumnHeader
            label="Assigned"
            field="assignee"
            activeField={teamSortField}
            activeDir={teamSortDir}
            hrefFor={teamSortHrefFor}
            className="w-32"
          />
          <SortableColumnHeader
            label="Title"
            field="title"
            activeField={teamSortField}
            activeDir={teamSortDir}
            hrefFor={teamSortHrefFor}
            className="min-w-0 flex-1"
          />
          <SortableColumnHeader
            label="Status"
            field="status"
            activeField={teamSortField}
            activeDir={teamSortDir}
            hrefFor={teamSortHrefFor}
          />
          <span className="w-4 shrink-0" aria-hidden="true" />
        </div>
        {sortedTeamRows.map(({ task: t, assigneeIds, assigneeNames, clientName, projectLabel }) => (
          <TaskRow
            key={t.id}
            task={t as TaskRowData}
            clientName={clientName}
            projectLabel={projectLabel}
            assigneeNames={assigneeNames}
            assigneeIds={assigneeIds}
            members={members ?? []}
            canDelete={canDeleteTasks}
            statusOptions={statusOptionsFor(t.status)}
            updateFieldAction={updateFieldAction}
            updateAssigneesAction={setTaskAssignees}
            deleteAction={deleteTask.bind(null, t.id)}
            fetchNotesAction={getTaskNotesAction}
            addNoteAction={addTaskNote.bind(null, t.id)}
          />
        ))}
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
}
