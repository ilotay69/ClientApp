import Link from "next/link";
import { createClient, createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import {
  fetchLoggedHoursForMonth,
  dayOfMonth,
  signedHours,
  LOGGED_HOURS_LABEL_OPTIONS,
  type LoggedHoursEntry,
} from "@/lib/logged-hours";
import { fetchTimeOffRequests, type TimeOffRequest } from "@/lib/time-off";
import { Badge } from "@/components/badge";
import { TimeOffRequestForm } from "@/components/time-off-request-form";
import { TimeOffRequestCard } from "@/components/time-off-request-card";
import {
  createTimeOffRequestAction,
  decideTimeOffRequestAction,
  addTimeOffNoteAction,
  withdrawTimeOffRequestAction,
} from "../time-off/actions";
import { LoggedHoursForm } from "@/components/logged-hours-form";
import { DeleteButton } from "@/components/delete-button";
import { formatDate } from "@/lib/format";
import { upsertLoggedHoursAction, deleteLoggedHoursAction } from "../hours-logged/actions";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { TaskFilterBar } from "@/components/task-filter-bar";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import { MailboxReviewPanel } from "@/components/mailbox-review-panel";
import { MailboxSnapshotPreview } from "@/components/mailbox-snapshot-preview";
import { SyncMailboxButton } from "@/components/sync-mailbox-button";
import { UpcomingAppointments } from "@/components/upcoming-appointments";
import { Tabs } from "@/components/tabs";
import { MyTicketsTab } from "@/components/my-tickets-tab";
import {
  createTask,
  deleteTask,
  updateTaskField,
  setTaskAssignees,
  getTaskNotesAction,
  addTaskNote,
} from "../tasks/actions";
import { fetchMyTicketDescriptionAction } from "./actions";
import {
  fetchMyUpcomingAppointments,
  dismissAppointmentType,
  clearDismissedAppointmentTypes,
  fetchMySnapshotSenders,
  fetchMySnapshotPreview,
  syncMyMailboxNow,
  dismissMailboxThread,
  clearDismissedMailboxThreads,
  fetchMyOpenTicketsAction,
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

const TAB_INDEX: Record<string, number> = { mailbox: 0, tasks: 1, tickets: 2, hours: 3, timeoff: 4 };

function parseMonthParam(month: string | undefined): { year: number; month: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Payroll cutoff nudges - the 1st-15th half closes on the 15th, so from
 * the 10th it's worth a reminder to finish that half; the 16th-end half
 * closes at month end, so from the 25th it's worth reminding people to log
 * the rest of the month in advance. Only meaningful for the real current
 * month, never a past/future one someone navigated to with Prev/Next. */
function payrollReminderMessage(todayDayOfMonth: number): string | null {
  if (todayDayOfMonth >= 10 && todayDayOfMonth <= 15) {
    return "Please complete your hours up to the 15th so they can be submitted to payroll.";
  }
  if (todayDayOfMonth >= 25) {
    return "Please complete your hours in advance up to the end of the month so they can be submitted to payroll.";
  }
  return null;
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

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
    month?: string;
  }>;
}) {
  const {
    tab,
    client: filterClient,
    priority: filterPriorityRaw,
    status: filterStatusRaw,
    sort: rawSort,
    dir: rawDir,
    month: monthParamValue,
  } = await searchParams;
  const filterPriorities = Array.isArray(filterPriorityRaw) ? filterPriorityRaw : filterPriorityRaw ? [filterPriorityRaw] : [];
  const filterStatuses = Array.isArray(filterStatusRaw) ? filterStatusRaw : filterStatusRaw ? [filterStatusRaw] : [];
  const sortField = rawSort || "due_date";
  const sortDir: SortDir = rawDir === "desc" ? "desc" : "asc";

  const supabase = await createClient();
  const user = await getCurrentUser();

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

  const { data: personalTasks } = await personalQuery;

  const me = await getMyPermissions(supabase);
  const isOwner = me?.role === "owner";
  const { year: hoursYear, month: hoursMonth } = parseMonthParam(monthParamValue);
  const hoursPrev = shiftMonth(hoursYear, hoursMonth, -1);
  const hoursNext = shiftMonth(hoursYear, hoursMonth, 1);
  const admin = createAdminClient();
  const [myHoursEntries, allHoursEntries]: [LoggedHoursEntry[], LoggedHoursEntry[]] = me
    ? await Promise.all([
        fetchLoggedHoursForMonth(hoursYear, hoursMonth, { userId: me.userId }, admin),
        isOwner ? fetchLoggedHoursForMonth(hoursYear, hoursMonth, {}, admin) : Promise.resolve([]),
      ])
    : [[], []];
  const splitHalves = (entries: LoggedHoursEntry[]) => ({
    first: entries.filter((e) => dayOfMonth(e.workDate) <= 15),
    second: entries.filter((e) => dayOfMonth(e.workDate) > 15),
  });
  const myHoursHalves = splitHalves(myHoursEntries);
  const teamHoursHalves = isOwner ? splitHalves(allHoursEntries) : null;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const hoursMonthLabel = MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(hoursYear, hoursMonth - 1, 1)));
  const isCurrentHoursMonth =
    hoursYear === today.getUTCFullYear() && hoursMonth === today.getUTCMonth() + 1;
  const payrollReminder = isCurrentHoursMonth ? payrollReminderMessage(today.getUTCDate()) : null;

  const [myTimeOffRequests, allTimeOffRequests]: [TimeOffRequest[], TimeOffRequest[]] = me
    ? await Promise.all([
        fetchTimeOffRequests({ userId: me.userId }, admin),
        isOwner ? fetchTimeOffRequests({}, admin) : Promise.resolve([]),
      ])
    : [[], []];
  const teamTimeOffRequests = isOwner ? allTimeOffRequests.filter((r) => r.userId !== me?.userId) : [];
  // Visible to everyone, not just owners - "who's off when" is ordinary
  // team-calendar information, unlike the pending/declined requests above
  // (which can carry a personal reason) that stay owner-only.
  const approvedTimeOff = me
    ? (await fetchTimeOffRequests({ status: "approved", fromDate: todayStr }, admin)).sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      )
    : [];

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-nowrap sm:px-5">
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
    <MyTicketsTab
      action={fetchMyOpenTicketsAction}
      descriptionAction={fetchMyTicketDescriptionAction}
      fullName={profile?.full_name ?? null}
    />
  );

  const hoursLoggedTab = (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Log the hours you worked each day — split into the 1st–15th and 16th–end of month.
      </p>

      {payrollReminder && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {payrollReminder}
        </div>
      )}

      <LoggedHoursForm action={upsertLoggedHoursAction} defaultDate={todayStr} />

      <div className="flex items-center justify-center gap-2">
        <Link
          href={filterHref("/my-todo", { tab: "hours", month: monthParam(hoursPrev.year, hoursPrev.month) })}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          ← Prev
        </Link>
        <p className="text-xs font-semibold text-slate-900">{hoursMonthLabel}</p>
        <Link
          href={filterHref("/my-todo", { tab: "hours", month: monthParam(hoursNext.year, hoursNext.month) })}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          Next →
        </Link>
      </div>

      <div>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">My hours</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HoursHalfCard title="1st – 15th" entries={myHoursHalves.first} deleteAction={deleteLoggedHoursAction} />
          <HoursHalfCard
            title="16th – End of month"
            entries={myHoursHalves.second}
            deleteAction={deleteLoggedHoursAction}
          />
        </div>
      </div>

      {isOwner && teamHoursHalves && (
        <div>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Team hours</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TeamHoursHalfCard title="1st – 15th" entries={teamHoursHalves.first} />
            <TeamHoursHalfCard title="16th – End of month" entries={teamHoursHalves.second} />
          </div>
        </div>
      )}
    </div>
  );

  const timeOffTab = (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Request time off, then track it here — {isOwner ? "approve or discuss" : "an owner will approve, decline, or discuss"} it, right on the request.
      </p>

      <TimeOffRequestForm action={createTimeOffRequestAction} defaultDate={todayStr} />

      <div>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          My requests <span className="normal-case text-slate-400">({myTimeOffRequests.length})</span>
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {myTimeOffRequests.map((r) => (
              <TimeOffRequestCard
                key={r.id}
                request={r}
                isOwner={isOwner}
                currentUserId={me?.userId ?? ""}
                showRequester={false}
                decideAction={decideTimeOffRequestAction}
                addNoteAction={addTimeOffNoteAction}
                withdrawAction={withdrawTimeOffRequestAction}
              />
            ))}
            {myTimeOffRequests.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-500">Nothing requested yet.</p>
            )}
          </div>
        </div>
      </div>

      {isOwner && (
        <div>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Team requests <span className="normal-case text-slate-400">({teamTimeOffRequests.length})</span>
          </h2>
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {teamTimeOffRequests.map((r) => (
                <TimeOffRequestCard
                  key={r.id}
                  request={r}
                  isOwner={isOwner}
                  currentUserId={me?.userId ?? ""}
                  showRequester
                  decideAction={decideTimeOffRequestAction}
                  addNoteAction={addTimeOffNoteAction}
                  withdrawAction={withdrawTimeOffRequestAction}
                />
              ))}
              {teamTimeOffRequests.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-slate-500">Nothing from the team yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Approved time off <span className="normal-case text-slate-400">({approvedTimeOff.length})</span>
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {approvedTimeOff.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                <span className="text-sm font-medium text-slate-900">{r.userName}</span>
                <div className="flex items-center gap-1.5">
                  <Badge value={r.type} />
                  <span className="text-sm text-slate-700">
                    {formatDate(r.startDate)}
                    {r.endDate !== r.startDate && <> – {formatDate(r.endDate)}</>}
                  </span>
                </div>
              </div>
            ))}
            {approvedTimeOff.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-slate-500">No upcoming approved time off.</p>
            )}
          </div>
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
        { label: "Hours Logged", content: hoursLoggedTab },
        { label: "Vacations/Sick", content: timeOffTab },
      ]}
      defaultActive={TAB_INDEX[tab ?? ""] ?? 0}
      orientation="vertical"
    />
  );
}

function labelText(label: LoggedHoursEntry["label"]): string {
  return LOGGED_HOURS_LABEL_OPTIONS.find((o) => o.value === label)?.label ?? label;
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" });

function weekdayText(workDate: string): string {
  return WEEKDAY_FORMATTER.format(new Date(`${workDate}T00:00:00Z`));
}

function HoursHalfCard({
  title,
  entries,
  deleteAction,
}: {
  title: string;
  entries: LoggedHoursEntry[];
  deleteAction: (id: string) => Promise<void>;
}) {
  const total = entries.reduce((sum, e) => sum + signedHours(e), 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5">
        <p className="text-xs font-semibold text-slate-900">{title}</p>
        <p className="text-xs font-semibold text-teal-700">{total.toFixed(2)}h</p>
      </div>
      <div className="divide-y divide-slate-100">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            <div>
              <span className="text-xs text-slate-400">{weekdayText(e.workDate)}</span>{" "}
              <span className="text-sm text-slate-700">{formatDate(e.workDate)}</span>
              {e.label !== "regular" && (
                <span className="ml-1.5 text-xs text-slate-400">{labelText(e.label)}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium tabular-nums ${
                  e.label === "taken_off" ? "text-red-600" : "text-slate-900"
                }`}
              >
                {signedHours(e).toFixed(2)}h
              </span>
              <DeleteButton
                action={deleteAction.bind(null, e.id)}
                confirmText={`Remove the ${e.hours}h ${labelText(e.label)} entry for ${formatDate(e.workDate)}?`}
                label="Remove"
              />
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-500">Nothing logged yet.</p>
        )}
      </div>
    </div>
  );
}

/** Grouped by staff member within the half - same "section header with a
 * subtotal, then its rows" pattern as the Team Hours dashboard widget's own
 * drill-down (/dashboard/resource-hours). */
function TeamHoursHalfCard({ title, entries }: { title: string; entries: LoggedHoursEntry[] }) {
  const byUser = new Map<string, { userId: string; userName: string; entries: LoggedHoursEntry[] }>();
  for (const e of entries) {
    const g = byUser.get(e.userId) ?? { userId: e.userId, userName: e.userName, entries: [] };
    g.entries.push(e);
    byUser.set(e.userId, g);
  }
  const groups = [...byUser.values()].sort((a, b) => a.userName.localeCompare(b.userName));
  const total = entries.reduce((sum, e) => sum + signedHours(e), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5">
        <p className="text-xs font-semibold text-slate-900">{title}</p>
        <p className="text-xs font-semibold text-teal-700">{total.toFixed(2)}h</p>
      </div>
      <div className="divide-y divide-slate-200">
        {groups.map((g) => {
          const groupTotal = g.entries.reduce((sum, e) => sum + signedHours(e), 0);
          return (
            <div key={g.userId}>
              <div className="flex items-center justify-between bg-slate-50 px-3 py-1">
                <p className="text-xs font-semibold text-slate-700">{g.userName}</p>
                <p className="text-xs font-semibold text-slate-500">{groupTotal.toFixed(2)}h</p>
              </div>
              <div className="divide-y divide-slate-100">
                {g.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-1">
                    <div>
                      <span className="text-xs text-slate-400">{weekdayText(e.workDate)}</span>{" "}
                      <span className="text-sm text-slate-700">{formatDate(e.workDate)}</span>
                      {e.label !== "regular" && (
                        <span className="ml-1.5 text-xs text-slate-400">{labelText(e.label)}</span>
                      )}
                    </div>
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        e.label === "taken_off" ? "text-red-600" : "text-slate-900"
                      }`}
                    >
                      {signedHours(e).toFixed(2)}h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-500">Nothing logged yet.</p>
        )}
      </div>
    </div>
  );
}
