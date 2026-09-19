import type { MyOpenTicketsResult } from "./my-tickets";
import type {
  UpcomingAppointment,
  MailboxReviewState,
} from "../app/(dashboard)/dashboard/actions";
import type { TimeOffRequest } from "./time-off";

export const TODO_SECTIONS = [
  "today",
  "tasks",
  "inbox",
  "tickets",
  "time",
] as const;
export type TodoSection = (typeof TODO_SECTIONS)[number];
export const TASK_STATUSES = {
  open: "Open",
  in_progress: "In progress",
  on_hold: "On hold",
  waiting_client: "Waiting on client",
  done: "Completed",
  dismissed: "Archived",
} as const;
export type TaskStatus = keyof typeof TASK_STATUSES;
export type TodoTask = {
  id: string;
  title: string;
  detail: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  client_id: string | null;
  clientName: string | null;
  is_personal: boolean;
  updated_at: string;
};
export type TaskDraft = {
  title: string;
  detail: string;
  priority: string;
  due_date: string | null;
  client_id: string | null;
};
export type TaskFilters = {
  q: string;
  scope: "all" | "private" | "assigned";
  status: "active" | "all" | TaskStatus;
  priority: string;
  client: string;
  group: "due" | "status" | "client";
  layout: "list" | "board";
};
export type TodoPreferences = {
  view: "old" | "new";
  density: "comfortable" | "compact";
  showClient: boolean;
  showPriority: boolean;
  panelWidth: number;
  savedViews: { id: string; name: string; filters: TaskFilters }[];
};
export type ItemState = {
  item_key: string;
  planned_on: string | null;
  position: number;
  snoozed_until: string | null;
};
export type MailThread = {
  conversationId: string;
  messageId: string;
  subject: string;
  contact: string;
  preview: string;
  webLink: string | null;
  receivedAt: string;
  direction: "received" | "sent";
  dismissed: boolean;
  taskId: string | null;
};
export type InboxData = {
  connected: boolean;
  threads: MailThread[];
  syncedAt: string | null;
  truncated: boolean;
  preferences: { days: number; excludes: string; neverStore: string };
};
export type HoursEntry = {
  id: string;
  work_date: string;
  hours: number;
  label: "regular" | "after_hours" | "taken_off";
  userName?: string;
};
export type TimeData = {
  hours: HoursEntry[];
  requests: TimeOffRequest[];
  teamRequests: TimeOffRequest[];
  teamHours: HoursEntry[];
  absences: { id: string; name: string; start: string; end: string }[];
  isOwner: boolean;
  userId: string;
};
export type Result<T> =
  | { data: T; error?: never }
  | { error: string; data?: never };
export type TodoData = {
  today: string;
  tasks: TodoTask[];
  clients: { id: string; name: string }[];
  preferences: TodoPreferences;
  items: ItemState[];
  warning: string | null;
  truncated: boolean;
};
export type TodoActions = {
  notes: (id: string) => Promise<
    Result<
      {
        id: string;
        body: string;
        created_at: string;
        authorName: string | null;
      }[]
    >
  >;
  addNote: (id: string, body: string) => Promise<Result<null>>;
  refresh: () => Promise<Result<TodoData>>;
  preferences: (value: TodoPreferences) => Promise<Result<TodoPreferences>>;
  plan: (
    key: string,
    date: string | null,
    position?: number,
    snooze?: string | null,
  ) => Promise<Result<ItemState>>;
  create: (
    draft: TaskDraft,
    source?: { conversationId: string; messageId: string },
  ) => Promise<Result<TodoTask>>;
  update: (
    id: string,
    patch: Partial<TaskDraft> & { status?: TaskStatus },
    expectedUpdatedAt: string,
  ) => Promise<Result<TodoTask>>;
  inbox: () => Promise<Result<InboxData>>;
  review: (form: FormData) => Promise<MailboxReviewState>;
  sync: () => Promise<{ ok: boolean; message: string } | { error: string }>;
  dismiss: (
    conversationId: string,
    messageId: string,
    dismissed: boolean,
  ) => Promise<Result<null>>;
  tickets: () => Promise<MyOpenTicketsResult | { error: string }>;
  ticketDetail: (
    id: number,
  ) => Promise<{ description: string | null } | { error: string }>;
  agenda: () => Promise<
    | { appointments: UpcomingAppointment[]; dismissedCount: number }
    | { error: string }
  >;
  time: (month: string) => Promise<Result<TimeData>>;
  hours: (
    date: string,
    label: HoursEntry["label"],
    hours: number,
  ) => Promise<Result<null>>;
  leave: (form: FormData) => Promise<{ error: string | null }>;
  decideLeave: (
    id: string,
    decision: "approved" | "declined",
  ) => Promise<{ error: string | null }>;
  withdrawLeave: (id: string) => Promise<{ error: string | null }>;
  leaveNote: (form: FormData) => Promise<{ error: string | null }>;
};

export const DEFAULT_FILTERS: TaskFilters = {
  q: "",
  scope: "all",
  status: "active",
  priority: "",
  client: "",
  group: "due",
  layout: "list",
};
export const DEFAULT_PREFERENCES: TodoPreferences = {
  view: "new",
  density: "comfortable",
  showClient: true,
  showPriority: true,
  panelWidth: 480,
  savedViews: [],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
export function isDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "2199-12-31"
  )
    return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date: string, days: number): string {
  const next = new Date(date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
export function weekDates(date: string): string[] {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  const monday = shiftDate(date, -(day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}
export function dateLabel(date: string | null, today?: string): string {
  if (!date) return "No due date";
  if (date === today) return "Today";
  if (today && date === shiftDate(today, 1)) return "Tomorrow";
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
export function sectionFromTab(value: string | null): TodoSection {
  if (TODO_SECTIONS.includes(value as TodoSection)) return value as TodoSection;
  return (
    (
      { mailbox: "inbox", hours: "time", timeoff: "time" } as Record<
        string,
        TodoSection
      >
    )[value ?? ""] ?? "today"
  );
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function normalizeFilters(value: unknown): TaskFilters {
  const v = record(value);
  return {
    q: typeof v.q === "string" ? v.q.slice(0, 200) : "",
    scope: v.scope === "private" || v.scope === "assigned" ? v.scope : "all",
    status:
      typeof v.status === "string" &&
      ["active", "all", ...Object.keys(TASK_STATUSES)].includes(v.status)
        ? (v.status as TaskFilters["status"])
        : "active",
    priority:
      v.priority === "high" || v.priority === "medium" || v.priority === "low"
        ? v.priority
        : "",
    client: isUuid(v.client) ? v.client : "",
    group: v.group === "status" || v.group === "client" ? v.group : "due",
    layout: v.layout === "board" ? "board" : "list",
  };
}
export function normalizePreferences(value: unknown): TodoPreferences {
  const v = record(value);
  const ids = new Set<string>();
  const savedViews: TodoPreferences["savedViews"] = [];
  for (const raw of Array.isArray(v.savedViews)
    ? v.savedViews.slice(0, 12)
    : []) {
    const s = record(raw);
    if (
      !isUuid(s.id) ||
      ids.has(s.id) ||
      typeof s.name !== "string" ||
      !s.name.trim()
    )
      continue;
    ids.add(s.id);
    savedViews.push({
      id: s.id,
      name: s.name.trim().slice(0, 40),
      filters: normalizeFilters(s.filters),
    });
  }
  return {
    view: v.view === "old" ? "old" : "new",
    density: v.density === "compact" ? "compact" : "comfortable",
    showClient: v.showClient !== false,
    showPriority: v.showPriority !== false,
    panelWidth:
      typeof v.panelWidth === "number" && Number.isFinite(v.panelWidth)
        ? Math.max(360, Math.min(760, Math.round(v.panelWidth)))
        : 480,
    savedViews,
  };
}
export function validateDraft(value: unknown): Result<TaskDraft> {
  const v = record(value);
  if (
    typeof v.title !== "string" ||
    !v.title.trim() ||
    v.title.trim().length > 240
  )
    return { error: "Enter a task title (up to 240 characters)." };
  if (
    v.detail != null &&
    (typeof v.detail !== "string" || v.detail.length > 10000)
  )
    return { error: "Notes must be no more than 10,000 characters." };
  if (v.due_date != null && !isDate(v.due_date))
    return { error: "Choose a valid due date or No due date." };
  if (v.client_id != null && !isUuid(v.client_id))
    return { error: "Choose a valid client." };
  if (v.priority !== "high" && v.priority !== "medium" && v.priority !== "low")
    return { error: "Choose a valid priority." };
  return {
    data: {
      title: v.title.trim(),
      detail: typeof v.detail === "string" ? v.detail.trim() : "",
      due_date: (v.due_date as string | null) ?? null,
      client_id: (v.client_id as string | null) ?? null,
      priority: v.priority as string,
    },
  };
}
export function filterTasks(
  tasks: TodoTask[],
  filters: TaskFilters,
): TodoTask[] {
  const q = filters.q.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (!q ||
        `${t.title} ${t.clientName ?? ""} ${t.detail ?? ""}`
          .toLowerCase()
          .includes(q)) &&
      (filters.scope === "all" ||
        (filters.scope === "private" ? t.is_personal : !t.is_personal)) &&
      (filters.status === "all" ||
        (filters.status === "active"
          ? t.status !== "done" && t.status !== "dismissed"
          : t.status === filters.status)) &&
      (!filters.priority || t.priority === filters.priority) &&
      (!filters.client || t.client_id === filters.client),
  );
}
export function dueGroup(task: TodoTask, today: string): string {
  if (task.status === "done") return "Completed";
  if (task.status === "dismissed") return "Archived";
  if (!task.due_date) return "No due date";
  if (task.due_date < today) return "Overdue";
  if (task.due_date === today) return "Due today";
  if (task.due_date <= shiftDate(today, 7)) return "Next 7 days";
  return "Later";
}
export function groupTasks(
  tasks: TodoTask[],
  group: TaskFilters["group"],
  today: string,
): [string, TodoTask[]][] {
  const map = new Map<string, TodoTask[]>();
  for (const task of [...tasks].sort(
    (a, b) =>
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      a.title.localeCompare(b.title),
  )) {
    const key =
      group === "status"
        ? (TASK_STATUSES[task.status] ?? task.status)
        : group === "client"
          ? (task.clientName ?? "No client")
          : dueGroup(task, today);
    map.set(key, [...(map.get(key) ?? []), task]);
  }
  const order =
    group === "due"
      ? [
          "Overdue",
          "Due today",
          "Next 7 days",
          "Later",
          "No due date",
          "Completed",
          "Archived",
        ]
      : group === "status"
        ? Object.values(TASK_STATUSES)
        : [...map.keys()].sort();
  return order.filter((k) => map.has(k)).map((k) => [k, map.get(k)!]);
}
export function safeExternalUrl(value: string | null): string | undefined {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function signedTotal(
  entries: Pick<HoursEntry, "hours" | "label">[],
): number {
  return entries.reduce(
    (total, e) => total + (e.label === "taken_off" ? -e.hours : e.hours),
    0,
  );
}
