import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FILTERS,
  DEFAULT_PREFERENCES,
  isDate,
  isUuid,
  localDate,
  shiftDate,
  weekDates,
  dateLabel,
  normalizeFilters,
  normalizePreferences,
  validateDraft,
  filterTasks,
  groupTasks,
  signedTotal,
  safeExternalUrl,
  sectionFromTab,
} from "../src/lib/my-todo-workspace.ts";
const id = "11111111-1111-4111-8111-111111111111";
const today = "2026-09-19";
const base = {
  id,
  title: "Review backups",
  detail: "Verify the overnight jobs",
  notes: null,
  status: "open",
  priority: "medium",
  due_date: null,
  start_date: null,
  client_id: null,
  clientName: null,
  is_personal: true,
  updated_at: "2026-09-19T10:00:00Z",
};
test("calendar dates reject impossible dates and unsafe values", () => {
  for (const value of [
    null,
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-09-00",
    "09/19/2026",
    "2026-09-19T00:00Z",
    {},
    "1900-01-01",
  ])
    assert.equal(isDate(value), false, String(value));
  assert.ok(isDate("2024-02-29"));
  assert.ok(isDate(today));
  assert.ok(isUuid(id));
  assert.equal(isUuid("id,created_by.eq.other"), false);
});
test("date arithmetic crosses month, year and daylight-saving boundaries", () => {
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2024-02-28", 1), "2024-02-29");
  assert.deepEqual(weekDates("2026-03-08"), [
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-03-06",
    "2026-03-07",
    "2026-03-08",
  ]);
  assert.equal(weekDates("2026-01-01")[0], "2025-12-29");
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dateLabel(null, today), "No due date");
  assert.equal(dateLabel("2026-09-20", today), "Tomorrow");
});
test("legacy links map to the correct new section", () => {
  assert.equal(sectionFromTab("mailbox"), "inbox");
  assert.equal(sectionFromTab("timeoff"), "time");
  assert.equal(sectionFromTab("hours"), "time");
  assert.equal(sectionFromTab("tickets"), "tickets");
  assert.equal(sectionFromTab("unknown"), "today");
});
test("preferences retain old view and clamp malformed input", () => {
  for (const v of [null, [], "broken", {}])
    assert.deepEqual(normalizePreferences(v), DEFAULT_PREFERENCES);
  const prefs = normalizePreferences({
    view: "old",
    density: "compact",
    showClient: false,
    showPriority: false,
    panelWidth: 9000,
    savedViews: [
      {
        id,
        name: "  Review  ",
        filters: { priority: "medium", scope: "assigned" },
      },
      { id, name: "Duplicate" },
      { id: "bad", name: "Invalid" },
    ],
  });
  assert.equal(prefs.view, "old");
  assert.equal(prefs.density, "compact");
  assert.equal(prefs.panelWidth, 760);
  assert.equal(prefs.showClient, false);
  assert.equal(prefs.savedViews.length, 1);
  assert.equal(prefs.savedViews[0].name, "Review");
  assert.equal(prefs.savedViews[0].filters.priority, "medium");
  assert.deepEqual(normalizePreferences(prefs), prefs);
  assert.equal(normalizePreferences({ panelWidth: NaN }).panelWidth, 480);
  assert.equal(normalizePreferences({ panelWidth: -9 }).panelWidth, 360);
});
test("filters reject unsupported status, grouping and client injection", () => {
  assert.deepEqual(
    normalizeFilters({
      status: "not-status",
      scope: "everyone",
      client: "x,owner.eq.1",
      priority: "urgent",
      layout: "calendar",
      group: "other",
    }),
    DEFAULT_FILTERS,
  );
  assert.equal(normalizeFilters({ q: "x".repeat(800) }).q.length, 200);
});
test("new private tasks have explicitly no due date and support legacy medium", () => {
  const result = validateDraft({
    title: "  Check backups  ",
    detail: "  details  ",
    priority: "medium",
    due_date: null,
    client_id: null,
  });
  assert.deepEqual(result.data, {
    title: "Check backups",
    detail: "details",
    priority: "medium",
    due_date: null,
    client_id: null,
  });
  assert.ok(validateDraft({ title: "", priority: "low" }).error);
  assert.ok(validateDraft({ title: "x".repeat(241), priority: "low" }).error);
  assert.ok(
    validateDraft({
      title: "Valid",
      detail: "x".repeat(10001),
      priority: "low",
    }).error,
  );
  assert.ok(
    validateDraft({ title: "Valid", priority: "low", due_date: "2026-02-31" })
      .error,
  );
  assert.ok(
    validateDraft({ title: "Valid", priority: "low", client_id: "other" })
      .error,
  );
});
test("task filters keep private and assigned sources, exclude completed/archive by default", () => {
  const rows = [
    base,
    {
      ...base,
      id: "assigned",
      is_personal: false,
      status: "in_progress",
      clientName: "Acme",
    },
    { ...base, id: "done", status: "done" },
    { ...base, id: "archived", status: "dismissed" },
  ];
  assert.equal(filterTasks(rows, DEFAULT_FILTERS).length, 2);
  assert.equal(
    filterTasks(rows, { ...DEFAULT_FILTERS, scope: "assigned" })[0].id,
    "assigned",
  );
  assert.equal(
    filterTasks(rows, { ...DEFAULT_FILTERS, q: "ACME" })[0].id,
    "assigned",
  );
  assert.equal(
    filterTasks(rows, { ...DEFAULT_FILTERS, status: "all" }).length,
    4,
  );
  assert.equal(
    filterTasks(rows, { ...DEFAULT_FILTERS, priority: "high" }).length,
    0,
  );
});
test("due groups are ordered without mutating source rows", () => {
  const rows = [
    base,
    { ...base, id: "overdue", due_date: "2026-09-18" },
    { ...base, id: "today", due_date: today },
    { ...base, id: "week", due_date: "2026-09-26" },
    { ...base, id: "later", due_date: "2026-09-27" },
    { ...base, id: "done", status: "done", due_date: "2026-01-01" },
    { ...base, id: "archive", status: "dismissed" },
  ];
  const original = structuredClone(rows);
  assert.deepEqual(
    groupTasks(rows, "due", today).map((g) => g[0]),
    [
      "Overdue",
      "Due today",
      "Next 7 days",
      "Later",
      "No due date",
      "Completed",
      "Archived",
    ],
  );
  assert.deepEqual(rows, original);
  assert.equal(groupTasks(rows, "client", today)[0][0], "No client");
});
test("hours preserve payroll subtraction instead of assuming workday capacity", () => {
  assert.equal(
    signedTotal([
      { hours: 7.5, label: "regular" },
      { hours: 2, label: "after_hours" },
      { hours: 3, label: "taken_off" },
    ]),
    6.5,
  );
  assert.equal(signedTotal([{ hours: 8, label: "taken_off" }]), -8);
  assert.equal(signedTotal([]), 0);
});
test("external sources cannot introduce script or insecure links", () => {
  for (const value of [
    null,
    "javascript:alert(1)",
    "data:text/html,<script>",
    "http://example.test",
    "/redirect",
  ])
    assert.equal(safeExternalUrl(value), undefined);
  assert.equal(
    safeExternalUrl("https://outlook.office.com/mail/"),
    "https://outlook.office.com/mail/",
  );
});
test("new workspace migration limits state to its owner and deduplicates mail tasks transactionally", () => {
  const sql = readFileSync(
    new URL("../supabase/155_my_todo_workspaces.sql", import.meta.url),
    "utf8",
  );
  for (const table of [
    "my_todo_workspaces",
    "my_todo_item_state",
    "my_todo_mail_tasks",
  ])
    assert.ok(
      sql.includes(`alter table public.${table} enable row level security`),
    );
  assert.equal(
    (sql.match(/auth.uid\(\)=user_id and public.is_staff\(\)/g) || []).length,
    5,
  );
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(
    sql,
    /user_id=v_user and conversation_id=p_conversation and graph_message_id=p_message/,
  );
  assert.match(sql, /true,'general','open',v_user/);
  assert.match(sql, /revoke all on function/);
});
test("ticket descriptions verify the current user's live assignments before fetching content", () => {
  const source = readFileSync(
    new URL("../src/app/(dashboard)/my-todo/actions.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.indexOf("ownTickets.tickets.some") <
      source.indexOf("const ticket = await fetchTicketById"),
  );
  assert.match(source, /Number.isSafeInteger\(ticketId\)/);
});
