import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Badge } from "@/components/badge";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { TaskFilterBar } from "@/components/task-filter-bar";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import { MailboxReviewPanel } from "@/components/mailbox-review-panel";
import { MailboxSnapshotPreview } from "@/components/mailbox-snapshot-preview";
import { SyncMailboxButton } from "@/components/sync-mailbox-button";
import { UpcomingAppointments } from "@/components/upcoming-appointments";
import { Tabs } from "@/components/tabs";
import { formatDate } from "@/lib/format";
import { fetchMyOpenAutotaskTickets } from "@/lib/my-tickets";
import {
  createTask,
  deleteTask,
  updateTaskField,
  setTaskAssignees,
  getTaskNotesAction,
  addTaskNote,
} from "../tasks/actions";
import {
  fetchMyUpcomingAppointments,
  dismissAppointmentType,
  clearDismissedAppointmentTypes,
  fetchMySnapshotSenders,
  fetchMySnapshotPreview,
  syncMyMailboxNow,
  dismissMailboxThread,
  clearDismissedMailboxThreads,
} from "../dashboard/actions";
import { filterHref } from "@/components/filter-link";

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

function statusOptionsFor(current: string) {
  if (STATUS_OPTIONS.some((o) => o.value === current)) return STATUS_OPTIONS;
  return [...STATUS_OPTIONS, { value: current, label: current }];
}

type SortDir = "asc" | "desc";

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

const TAB_INDEX: Record<string, number> = { mailbox: 0, tasks: 1, tickets: 2 };

export default async function MyToDoPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    client?: string;
    priority?: string | string[];
    status?: string | string[];
    sort?: string;
    dir?: string;
  }>;
}) {
  const { tab, client: filterClient, priority: filterPriorityRaw, status: filterStatusRaw, sort: rawSort, dir: rawDir } =
    await searchParams;
  const filterPriorities = Array.isArray(filterPriorityRaw) ? filterPriorityRaw : filterPriorityRaw ? [filterPriorityRaw] : [];
  const filterStatuses = Array.isArray(filterStatusRaw) ? filterStatusRaw : filterStatusRaw ? [filterStatusRaw] : [];
  const sortField = rawSort || "due_date";
  const sortDir: SortDir = rawDir === "desc" ? "desc" : "asc";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: clients }, { data: mailPrefs }, { data: taskClientRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, autotask_resource_id")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("mail_connections")
      .select("review_excludes, review_lookback_days, sync_excluded_senders")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    // RLS already scopes this to the current user's own personal tasks.
    supabase.from("tasks").select("client_id").eq("is_personal", true).not("client_id", "is", null),
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const taskClientIds = new Set((taskClientRows ?? []).map((r) => r.client_id));
  const filterClients = (clients ?? []).filter((c) => taskClientIds.has(c.id));

  let personalQuery = supabase
    .from("tasks")
    .select("id, kind, title, detail, notes, status, priority, start_date, due_date, client_id, is_personal")
    .eq("is_personal", true)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (filterStatuses.length > 0) personalQuery = personalQuery.in("status", filterStatuses);
  if (filterClient) personalQuery = personalQuery.eq("client_id", filterClient);
  if (filterPriorities.length > 0) personalQuery = personalQuery.in("priority", filterPriorities);

  const [{ data: personalTasks }, myTicketsResult] = await Promise.all([
    personalQuery,
    fetchMyOpenAutotaskTickets(createAdminClient(), profile?.full_name ?? null, profile?.autotask_resource_id ?? null),
  ]);
  const myTickets = myTicketsResult.tickets;

  const sortHrefFor = (field: string, dir: SortDir) =>
    filterHref("/my-todo", { tab: "tasks", client: filterClient, priority: filterPriorities, status: filterStatuses, sort: field, dir });

  const todoRows = (personalTasks ?? []).map((t) => ({
    task: t,
    clientName: t.client_id ? (clientById.get(t.client_id) ?? null) : null,
  }));
  const sortedTodoRows = sortRows(todoRows, sortField, sortDir, (row, field) => {
    switch (field) {
      case "title":
        return row.task.title;
      case "status":
        return row.task.status;
      case "client":
        return row.clientName;
      case "due_date":
      default:
        return row.task.due_date;
    }
  });

  const mailboxTab = (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My To-Do</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your own list — only you can see or edit these, whether or not they&apos;re tied to work in
          this app.
        </p>
      </div>

      <SyncMailboxButton action={syncMyMailboxNow} />

      <MailboxReviewPanel
        initialDays={mailPrefs?.review_lookback_days ?? 30}
        initialExcludes={mailPrefs?.review_excludes ?? ""}
        initialNeverStore={mailPrefs?.sync_excluded_senders ?? ""}
        fetchSendersAction={fetchMySnapshotSenders}
        dismissThreadAction={dismissMailboxThread}
        clearDismissedThreadsAction={clearDismissedMailboxThreads}
      />

      <MailboxSnapshotPreview action={fetchMySnapshotPreview} />

      <UpcomingAppointments
        action={fetchMyUpcomingAppointments}
        dismissAction={dismissAppointmentType}
        clearDismissedAction={clearDismissedAppointmentTypes}
      />
    </div>
  );

  const myTasksTab = (
    <div className="space-y-6">
      <TaskFilterBar
        clients={filterClients}
        members={[]}
        priorityOptions={PRIORITY_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        values={{ client: filterClient ?? "", priorities: filterPriorities, assignee: "", statuses: filterStatuses }}
        showAssignee={false}
        action="/my-todo"
        preserve={{ tab: "tasks" }}
        clearHref={filterHref("/my-todo", { tab: "tasks" })}
      />

      <TaskQuickAdd clients={clients ?? []} projects={[]} members={[]} action={createTask} personal />

      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2">
          <SortableColumnHeader label="Due" field="due_date" activeField={sortField} activeDir={sortDir} hrefFor={sortHrefFor} className="w-24" />
          <SortableColumnHeader label="Client" field="client" activeField={sortField} activeDir={sortDir} hrefFor={sortHrefFor} className="w-32" />
          <SortableColumnHeader label="Title" field="title" activeField={sortField} activeDir={sortDir} hrefFor={sortHrefFor} className="min-w-0 flex-1" />
          <SortableColumnHeader label="Status" field="status" activeField={sortField} activeDir={sortDir} hrefFor={sortHrefFor} />
          <span className="w-4 shrink-0" aria-hidden="true" />
        </div>
        {sortedTodoRows.map(({ task: t, clientName }) => (
          <TaskRow
            key={t.id}
            task={{ ...t, project_id: null } as TaskRowData}
            clientName={clientName}
            assigneeNames=""
            assigneeIds={[]}
            members={[]}
            canDelete
            statusOptions={statusOptionsFor(t.status)}
            updateFieldAction={updateTaskField}
            updateAssigneesAction={setTaskAssignees}
            deleteAction={deleteTask.bind(null, t.id)}
            fetchNotesAction={getTaskNotesAction}
            addNoteAction={addTaskNote.bind(null, t.id)}
          />
        ))}
        {(personalTasks ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-slate-500">Nothing on your list yet. Add one above.</p>
        )}
      </div>
    </div>
  );

  const myTicketsTab = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">My Tickets</h2>
        <p className="mt-1 text-sm text-slate-500">
          Open Autotask tickets assigned to {profile?.full_name ?? "you"}.
        </p>
      </div>
      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {myTickets.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">
              {myTicketsResult.matchedResourceName === null
                ? `Couldn't match "${profile?.full_name ?? "your name"}" to an active Autotask resource — set yours explicitly under Settings → My Profile.`
                : "No open tickets assigned to you right now."}
            </p>
          ) : (
            myTickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {t.ticketNumber ? `#${t.ticketNumber} — ` : ""}
                    {t.title}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {t.clientName ?? "Unknown client"}
                    {t.queueName ? ` · ${t.queueName}` : ""}
                    {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.priority && <Badge value={t.priority} />}
                  {t.status && <Badge value={t.status} />}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Tabs
      tabs={[
        { label: "Mailbox Analysis", content: mailboxTab },
        { label: "My Tasks", content: myTasksTab },
        { label: "My Tickets", content: myTicketsTab },
      ]}
      defaultActive={TAB_INDEX[tab ?? ""] ?? 0}
    />
  );
}
