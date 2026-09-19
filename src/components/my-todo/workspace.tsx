"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import {
  DEFAULT_FILTERS,
  TODO_SECTIONS,
  TASK_STATUSES,
  filterTasks,
  groupTasks,
  normalizeFilters,
  sectionFromTab,
  localDate,
  shiftDate,
  dateLabel,
  safeExternalUrl,
  type TodoTask,
  type TodoData,
  type TodoActions,
  type TodoPreferences,
  type TaskFilters,
  type TodoSection,
} from "@/lib/my-todo-workspace";
import { TodoViewSwitch } from "./view-switch";
import { TaskEditor } from "./task-editor";
import { TodoInbox } from "./inbox";
import { TodoTickets } from "./tickets";
import { TodoTime } from "./time";
import { TodoIcon, Drawer, Empty, ErrorNotice, Loading, useRemote } from "./ui";
import s from "./workspace.module.css";
import { AnimatedTabs } from "../ui/animated-tabs";
import { HoverGroup, HoverButton } from "../ui/hover-surface";
import { StatefulButton, useActionFeedback } from "../ui/stateful-button";
import { AnimatedTooltip, TooltipCard } from "../ui/context-preview";

const LABELS: Record<TodoSection, string> = {
  today: "Today",
  tasks: "Tasks",
  inbox: "Inbox",
  tickets: "Tickets",
  time: "Time & leave",
};
function subscribeDate(listener: () => void) {
  const timer = window.setInterval(listener, 60000);
  return () => clearInterval(timer);
}
export function TodoWorkspace({
  initial,
  actions,
}: {
  initial: TodoData;
  actions: TodoActions;
}) {
  const params = useSearchParams();
  const section = sectionFromTab(params.get("tab"));
  const selectedId = params.get("item");
  const filters = normalizeFilters(Object.fromEntries(params.entries()));
  const [tasks, setTasks] = useState(initial.tasks);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [items, setItems] = useState(initial.items);
  const today = useSyncExternalStore(
    subscribeDate,
    localDate,
    () => initial.today,
  );
  const [settings, setSettings] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [error, setError] = useState<string | null>(initial.warning);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const refreshFeedback = useActionFeedback();
  const [undo, setUndo] = useState<{
    task: TodoTask;
    previous: TodoTask["status"];
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setUndo(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        )
      )
        return;
      if (e.key === "/" && (section === "tasks" || section === "today")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [section]);
  function url(patch: Record<string, string | null>, replace = false) {
    const query = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") query.delete(k);
      else query.set(k, v);
    }
    window.history[replace ? "replaceState" : "pushState"](
      null,
      "",
      `${window.location.pathname}?${query}`,
    );
  }
  function navigate(tab: TodoSection) {
    url({
      tab,
      item: null,
      q: null,
      scope: null,
      status: null,
      priority: null,
      client: null,
      group: null,
      layout: null,
    });
    setSelected([]);
    setSelectMode(false);
    setError(null);
  }
  function filter(patch: Partial<TaskFilters>) {
    url({ ...patch }, true);
    setSelected([]);
  }
  function updateTask(task: TodoTask) {
    setTasks((rows) =>
      rows.some((r) => r.id === task.id)
        ? rows.map((r) => (r.id === task.id ? task : r))
        : [task, ...rows],
    );
  }
  async function prefs(patch: Partial<TodoPreferences>) {
    if (savingPrefs) return;
    const next = { ...preferences, ...patch };
    setSavingPrefs(true);
    setError(null);
    try {
      const result = await actions.preferences(next);
      if (result.error !== undefined) setError(result.error);
      else {
        setPreferences(result.data);
        setNotice("Preferences saved");
      }
    } catch {
      setError("Couldn't save preferences. Please try again.");
    } finally {
      setSavingPrefs(false);
    }
  }
  async function refresh() {
    return refreshFeedback.run(async () => {
      setBusy(true);
      setError(null);
      try {
        const result = await actions.refresh();
        if (result.error !== undefined) {
          setError(result.error);
          return { ok: false, error: result.error };
        } else {
          setTasks(result.data.tasks);
          setItems(result.data.items);
          setError(result.data.warning);
          setNotice(result.data.warning ? "" : "Tasks refreshed");
          return result.data.warning
            ? { ok: false, error: result.data.warning }
            : { ok: true };
        }
      } catch {
        setError("Couldn't refresh tasks. Please try again.");
        return {
          ok: false,
          error: "Couldn't refresh tasks. Please try again.",
        };
      } finally {
        setBusy(false);
      }
    });
  }
  async function complete(task: TodoTask) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const status = task.status === "done" ? "open" : "done";
    updateTask({ ...task, status });
    try {
      const result = await actions.update(task.id, { status }, task.updated_at);
      if (result.error !== undefined) {
        updateTask(task);
        setError(result.error);
      } else {
        updateTask(result.data);
        setUndo({ task: result.data, previous: task.status });
        setNotice(status === "done" ? "Task completed" : "Task reopened");
      }
    } catch {
      updateTask(task);
      setError("Couldn't update this task. The change was undone.");
    } finally {
      setBusy(false);
    }
  }
  async function undoCompletion() {
    if (!undo) return;
    setBusy(true);
    try {
      const result = await actions.update(
        undo.task.id,
        { status: undo.previous },
        undo.task.updated_at,
      );
      if (result.error !== undefined) setError(result.error);
      else {
        updateTask(result.data);
        setUndo(null);
        setNotice("Change undone");
      }
    } catch {
      setError("Couldn't undo the change. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function plan(
    key: string,
    date: string | null,
    position = 0,
    snooze: string | null = null,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await actions.plan(key, date, position, snooze);
      if (result.error !== undefined) {
        setError(result.error);
        return false;
      }
      setItems((rows) => [
        ...rows.filter((r) => r.item_key !== key),
        result.data,
      ]);
      setNotice(
        date
          ? `Planned for ${dateLabel(date, today)} · deadline unchanged`
          : "Removed from plan · deadline unchanged",
      );
      return true;
    } catch {
      setError("Couldn't save the plan. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function bulk(kind: "complete" | "plan") {
    setBusy(true);
    setError(null);
    const failures: string[] = [];
    for (const id of selected) {
      const task = tasks.find((t) => t.id === id);
      if (!task) continue;
      try {
        if (kind === "complete") {
          const result = await actions.update(
            id,
            { status: "done" },
            task.updated_at,
          );
          if (result.error !== undefined) failures.push(task.title);
          else updateTask(result.data);
        } else {
          const result = await actions.plan(`task:${id}`, today);
          if (result.error !== undefined) failures.push(task.title);
          else
            setItems((rows) => [
              ...rows.filter((r) => r.item_key !== `task:${id}`),
              result.data,
            ]);
        }
      } catch {
        failures.push(task.title);
      }
    }
    setSelected([]);
    setBusy(false);
    if (failures.length)
      setError(
        `${failures.length} item(s) couldn't be changed. Refresh and try again.`,
      );
    else
      setNotice(
        `${selected.length} tasks ${kind === "complete" ? "completed" : "planned for today"}`,
      );
  }
  const itemMap = new Map(items.map((i) => [i.item_key, i]));
  const openTasks = tasks.filter(
    (t) => t.status !== "done" && t.status !== ("dismissed" as string),
  );
  const planned = tasks
    .filter(
      (t) =>
        itemMap.get(`task:${t.id}`)?.planned_on === today &&
        t.status !== "done" &&
        t.status !== ("dismissed" as string),
    )
    .sort(
      (a, b) =>
        (itemMap.get(`task:${a.id}`)?.position ?? 0) -
        (itemMap.get(`task:${b.id}`)?.position ?? 0),
    );
  const needsAttention = openTasks.filter(
    (t) =>
      t.due_date &&
      t.due_date <= today &&
      itemMap.get(`task:${t.id}`)?.planned_on !== today &&
      !(
        itemMap.get(`task:${t.id}`)?.planned_on &&
        itemMap.get(`task:${t.id}`)!.planned_on! < today
      ) &&
      !(
        itemMap.get(`task:${t.id}`)?.snoozed_until &&
        itemMap.get(`task:${t.id}`)!.snoozed_until! > today
      ),
  );
  const rollover = openTasks.filter((t) => {
    const d = itemMap.get(`task:${t.id}`)?.planned_on;
    return d && d < today;
  });
  const completed = tasks.filter(
    (t) =>
      t.status === "done" && itemMap.get(`task:${t.id}`)?.planned_on === today,
  );
  const visible = filterTasks(tasks, filters);
  const groups = groupTasks(visible, filters.group, today);
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  function row(task: TodoTask, extra?: ReactNode) {
    return (
      <TaskLine
        key={task.id}
        task={task}
        preferences={preferences}
        today={today}
        busy={busy}
        planned={itemMap.get(`task:${task.id}`)?.planned_on === today}
        onOpen={() => url({ item: task.id })}
        onComplete={() => complete(task)}
        onPlan={() =>
          plan(
            `task:${task.id}`,
            itemMap.get(`task:${task.id}`)?.planned_on === today ? null : today,
            planned.length,
          )
        }
        selectMode={selectMode}
        checked={selected.includes(task.id)}
        onSelect={() =>
          setSelected((ids) =>
            ids.includes(task.id)
              ? ids.filter((id) => id !== task.id)
              : [...ids, task.id],
          )
        }
        extra={extra}
      />
    );
  }
  async function reorder(ids: string[]) {
    const old = items;
    const changes = ids.map((id, position) => ({
      ...itemMap.get(`task:${id}`)!,
      position,
    }));
    setItems((rows) => [
      ...rows.filter((i) => !changes.some((c) => c.item_key === i.item_key)),
      ...changes,
    ]);
    setBusy(true);
    try {
      const results = await Promise.all(
        changes.map((i) => actions.plan(i.item_key, today, i.position)),
      );
      if (results.some((r) => r.error)) {
        setItems(old);
        setError(
          "Couldn't save the whole order. Refresh before reordering again.",
        );
      }
    } catch {
      setItems(old);
      setError("Couldn't save the order. Please refresh.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.workspace} data-density={preferences.density}>
      <div className={s.topbar}>
        <div className={s.breadcrumb}>
          Workspace <span>/</span>
          <strong>My To-Do</strong>
        </div>
        <TodoViewSwitch
          view="new"
          preferences={preferences}
          save={actions.preferences}
        />
      </div>
      <header className={s.header}>
        <div>
          <h1>My To-Do</h1>
          <p>
            {new Date(today + "T12:00:00Z").toLocaleDateString("en-CA", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
            <span>·</span>
            {openTasks.length} open tasks
          </p>
        </div>
        <div className={s.actions}>
          <AnimatedTooltip content="Change spacing, visible columns, and panel width">
            <button
              className={s.iconButton}
              title="Display settings"
              aria-label="Display settings"
              onClick={() => setSettings(true)}
            >
              <TodoIcon name="settings" />
            </button>
          </AnimatedTooltip>
          <StatefulButton
            className={s.button}
            onClick={refresh}
            status={refreshFeedback.status}
            disabled={busy}
            pendingLabel="Refreshing…"
            successLabel="Updated"
            errorLabel="Retry refresh"
            icon={<TodoIcon name="refresh" />}
          >
            Refresh
          </StatefulButton>
          <button className={s.primary} onClick={() => setNewTask(true)}>
            <TodoIcon name="plus" />
            New task
          </button>
        </div>
      </header>
      <AnimatedTabs
        className={s.tabs}
        label="My To-Do sections"
        value={section}
        onChange={navigate}
        navigation
        items={TODO_SECTIONS.map((tab) => ({
          value: tab,
          label: (
            <>
              <TodoIcon name={tab} />
              {LABELS[tab]}
              {tab === "tasks" && (
                <span className={s.count}>{openTasks.length}</span>
              )}
              {tab === "today" && planned.length > 0 && (
                <span className={s.count}>{planned.length}</span>
              )}
            </>
          ),
        }))}
      />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {initial.truncated && (
        <p className={s.warning}>
          This view is limited to the first 1,000 task assignments. Use the team
          Tasks page for the full list.
        </p>
      )}
      <div role="status" className={notice ? s.toast : s.srOnly}>
        {notice}
        {undo && (
          <button disabled={busy} onClick={undoCompletion}>
            Undo
          </button>
        )}
        {notice && (
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setNotice(null);
              setUndo(null);
            }}
          >
            ×
          </button>
        )}
      </div>
      {section === "today" && (
        <div className={s.todayGrid}>
          <div className={s.mainColumn}>
            <div className={s.sectionHeading}>
              <div>
                <h2>
                  Today’s plan <span>{planned.length}</span>
                </h2>
                <p>Planned work, separate from due dates.</p>
              </div>
              <button
                className={s.textButton}
                onClick={() => navigate("tasks")}
              >
                Choose tasks <TodoIcon name="arrow" />
              </button>
            </div>
            <form
              className={s.quickAdd}
              onSubmit={(e) => {
                e.preventDefault();
                setNewTask(true);
              }}
            >
              <TodoIcon name="plus" />
              <input
                aria-label="Quick task title"
                placeholder="Add a private task…"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                maxLength={240}
              />
              <button type="submit">
                Add task <span>↵</span>
              </button>
            </form>
            <div className={s.card}>
              {planned.length ? (
                <PlanList
                  tasks={planned}
                  disabled={busy}
                  reduced={!!reduced}
                  onReorder={reorder}
                  render={(task, index) =>
                    row(
                      task,
                      <div className={s.moveActions}>
                        <button
                          aria-label={`Move ${task.title} up`}
                          disabled={busy || index === 0}
                          onClick={() => {
                            const ids = planned.map((t) => t.id);
                            [ids[index - 1], ids[index]] = [
                              ids[index],
                              ids[index - 1],
                            ];
                            void reorder(ids);
                          }}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${task.title} down`}
                          disabled={busy || index === planned.length - 1}
                          onClick={() => {
                            const ids = planned.map((t) => t.id);
                            [ids[index + 1], ids[index]] = [
                              ids[index],
                              ids[index + 1],
                            ];
                            void reorder(ids);
                          }}
                        >
                          ↓
                        </button>
                      </div>,
                    )
                  }
                />
              ) : (
                <Empty
                  title="No tasks planned for today"
                  icon="today"
                  action={
                    <button
                      className={s.button}
                      onClick={() => navigate("tasks")}
                    >
                      Choose from your tasks
                    </button>
                  }
                >
                  Add tasks to this plan with the calendar button.
                </Empty>
              )}
            </div>
            {rollover.length > 0 && (
              <section>
                <div className={s.sectionHeading}>
                  <div>
                    <h2>
                      Earlier plans <span>{rollover.length}</span>
                    </h2>
                    <p>Still open. Move them to today when you’re ready.</p>
                  </div>
                </div>
                <div className={s.card}>{rollover.map((t) => row(t))}</div>
              </section>
            )}
            <section>
              <div className={s.sectionHeading}>
                <div>
                  <h2>
                    Due & overdue <span>{needsAttention.length}</span>
                  </h2>
                  <p>Deadlines that need attention. Not yet in today’s plan.</p>
                </div>
              </div>
              <div className={s.card}>
                {needsAttention.length ? (
                  needsAttention.map((t) =>
                    row(
                      t,
                      <button
                        className={s.textButton}
                        disabled={busy}
                        title="Hide from this attention list until tomorrow; the deadline stays the same"
                        onClick={() =>
                          plan(
                            `task:${t.id}`,
                            itemMap.get(`task:${t.id}`)?.planned_on ?? null,
                            0,
                            shiftDate(today, 1),
                          )
                        }
                      >
                        Snooze
                      </button>,
                    ),
                  )
                ) : (
                  <Empty title="No other deadlines to review" icon="check" />
                )}
              </div>
            </section>
            <button
              className={s.completedToggle}
              aria-expanded={completedOpen}
              onClick={() => setCompletedOpen(!completedOpen)}
            >
              <TodoIcon name="check" />
              Completed in today’s plan <span>{completed.length}</span>
              <span>{completedOpen ? "−" : "+"}</span>
            </button>
            {completedOpen && (
              <div className={s.card}>
                {completed.length ? (
                  completed.map((t) => row(t))
                ) : (
                  <Empty title="No completed tasks in this plan" />
                )}
              </div>
            )}
            {items.some(
              (i) => i.item_key.startsWith("ticket:") && i.planned_on === today,
            ) && (
              <TodoTickets
                actions={actions}
                items={items}
                plan={plan}
                today={today}
                plannedOnly
              />
            )}
          </div>
          <aside className={s.rail}>
            <Agenda actions={actions} today={today} />
            <div className={s.summaryCard}>
              <h3>Task overview</h3>
              <div>
                <span>Overdue</span>
                <strong className={s.danger}>
                  {
                    openTasks.filter((t) => t.due_date && t.due_date < today)
                      .length
                  }
                </strong>
              </div>
              <div>
                <span>Due today</span>
                <strong>
                  {openTasks.filter((t) => t.due_date === today).length}
                </strong>
              </div>
              <div>
                <span>No due date</span>
                <strong>{openTasks.filter((t) => !t.due_date).length}</strong>
              </div>
              <div>
                <span>Private tasks</span>
                <strong>{openTasks.filter((t) => t.is_personal).length}</strong>
              </div>
              <button
                className={s.textButton}
                onClick={() => navigate("tasks")}
              >
                View all tasks <TodoIcon name="arrow" />
              </button>
            </div>
          </aside>
        </div>
      )}
      {section === "tasks" && (
        <section className={s.taskArea}>
          <div className={s.toolbar}>
            <label className={s.search}>
              <TodoIcon name="search" />
              <input
                ref={searchRef}
                aria-label="Search tasks"
                placeholder="Search tasks or clients…"
                value={filters.q}
                onChange={(e) => filter({ q: e.target.value })}
              />
              <kbd>/</kbd>
            </label>
            <select
              aria-label="Task ownership"
              value={filters.scope}
              onChange={(e) =>
                filter({ scope: e.target.value as TaskFilters["scope"] })
              }
            >
              <option value="all">Private & assigned</option>
              <option value="private">Private only</option>
              <option value="assigned">Assigned to me</option>
            </select>
            <select
              aria-label="Task status"
              value={filters.status}
              onChange={(e) =>
                filter({ status: e.target.value as TaskFilters["status"] })
              }
            >
              <option value="active">Active tasks</option>
              <option value="all">All statuses</option>
              {Object.entries(TASK_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Client filter"
              value={filters.client}
              onChange={(e) => filter({ client: e.target.value })}
            >
              <option value="">All clients</option>
              {initial.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Priority filter"
              value={filters.priority}
              onChange={(e) => filter({ priority: e.target.value })}
            >
              <option value="">Any priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className={s.listToolbar}>
            <span className={s.muted}>{visible.length} tasks</span>
            <select
              aria-label="Group tasks"
              value={filters.group}
              onChange={(e) =>
                filter({ group: e.target.value as TaskFilters["group"] })
              }
            >
              <option value="due">Group by due date</option>
              <option value="status">Group by status</option>
              <option value="client">Group by client</option>
            </select>
            <button
              className={s.textButton}
              onClick={() => {
                setSelectMode(!selectMode);
                setSelected([]);
              }}
            >
              {selectMode ? "Cancel selection" : "Select tasks"}
            </button>
            <button
              className={s.textButton}
              onClick={() => {
                filter(DEFAULT_FILTERS);
                setNotice("Filters reset");
              }}
            >
              Reset filters
            </button>
            <AnimatedTabs
              className={s.segmented}
              label="Task layout"
              value={filters.layout}
              onChange={(layout) => filter({ layout })}
              items={[
                {
                  value: "list",
                  label: <TodoIcon name="list" />,
                  accessibleLabel: "List layout",
                },
                {
                  value: "board",
                  label: <TodoIcon name="board" />,
                  accessibleLabel: "Board layout",
                },
              ]}
            />
          </div>
          <HoverGroup className={s.savedViews}>
            <span>Saved views</span>
            {preferences.savedViews.map((v) => (
              <span className={s.savedChip} key={v.id}>
                <HoverButton onClick={() => filter(v.filters)}>
                  {v.name}
                </HoverButton>
                <button
                  aria-label={`Delete saved view ${v.name}`}
                  disabled={savingPrefs}
                  onClick={() =>
                    prefs({
                      savedViews: preferences.savedViews.filter(
                        (x) => x.id !== v.id,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!saveName.trim()) return;
                void prefs({
                  savedViews: [
                    ...preferences.savedViews,
                    { id: crypto.randomUUID(), name: saveName.trim(), filters },
                  ],
                });
                setSaveName("");
              }}
            >
              <input
                aria-label="Saved view name"
                placeholder="Name this view"
                value={saveName}
                maxLength={40}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <button
                disabled={
                  savingPrefs ||
                  !saveName.trim() ||
                  preferences.savedViews.length >= 12
                }
              >
                Save view
              </button>
            </form>
          </HoverGroup>
          {selected.length > 0 && (
            <div className={s.bulkBar}>
              <strong>{selected.length} selected</strong>
              <button disabled={busy} onClick={() => bulk("plan")}>
                Plan for today
              </button>
              <button disabled={busy} onClick={() => bulk("complete")}>
                Mark completed
              </button>
              <button onClick={() => setSelected([])}>Clear</button>
            </div>
          )}
          {groups.length ? (
            <div className={filters.layout === "board" ? s.board : s.groupList}>
              {groups.map(([label, rows]) => (
                <section
                  className={
                    filters.layout === "board" ? s.boardColumn : undefined
                  }
                  key={label}
                >
                  <div className={s.groupHeading}>
                    <span className={label === "Overdue" ? s.redDot : s.dot} />
                    <h3>{label}</h3>
                    <span>{rows.length}</span>
                  </div>
                  <div className={s.card}>{rows.map((task) => row(task))}</div>
                </section>
              ))}
            </div>
          ) : (
            <div className={s.card}>
              <Empty
                title="No tasks match these filters"
                action={
                  <button
                    className={s.button}
                    onClick={() => filter(DEFAULT_FILTERS)}
                  >
                    Reset filters
                  </button>
                }
              >
                Try another search, status, or client.
              </Empty>
            </div>
          )}
        </section>
      )}
      {section === "inbox" && (
        <TodoInbox
          actions={actions}
          items={items}
          plan={plan}
          today={today}
          clients={initial.clients}
          preferences={preferences}
          onWidth={(width) => prefs({ panelWidth: width })}
          onTask={(task) => {
            updateTask(task);
            setNotice("Private task ready");
          }}
        />
      )}
      {section === "tickets" && (
        <TodoTickets
          actions={actions}
          items={items}
          plan={plan}
          today={today}
        />
      )}
      {section === "time" && (
        <TodoTime
          actions={actions}
          today={today}
          initialTab={params.get("tab") === "timeoff" ? "leave" : "hours"}
        />
      )}
      {(newTask || selectedTask) && (
        <TaskEditor
          key={selectedTask?.id ?? "new"}
          task={selectedTask}
          plannedOn={
            selectedTask
              ? (itemMap.get(`task:${selectedTask.id}`)?.planned_on ?? null)
              : null
          }
          onPlan={
            selectedTask
              ? (date) => plan(`task:${selectedTask.id}`, date)
              : undefined
          }
          initialTitle={quickTitle}
          clients={initial.clients}
          actions={actions}
          preferences={preferences}
          onWidth={(width) => prefs({ panelWidth: width })}
          onClose={() => {
            setNewTask(false);
            url({ item: null }, true);
          }}
          onSaved={(task) => {
            if (newTask && section === "today")
              void plan(`task:${task.id}`, today, planned.length);
            updateTask(task);
            setNewTask(false);
            setQuickTitle("");
            url({ item: null }, true);
            setNotice("Task saved");
          }}
        />
      )}
      <Drawer
        open={settings}
        onClose={() => setSettings(false)}
        title="Display settings"
        description="Saved to your account"
      >
        <div className={s.editor}>
          <label className={s.field}>
            Row spacing
            <select
              disabled={savingPrefs}
              value={preferences.density}
              onChange={(e) =>
                prefs({ density: e.target.value as TodoPreferences["density"] })
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className={s.checkLabel}>
            <input
              type="checkbox"
              checked={preferences.showClient}
              disabled={savingPrefs}
              onChange={(e) => prefs({ showClient: e.target.checked })}
            />
            Show client names
          </label>
          <label className={s.checkLabel}>
            <input
              type="checkbox"
              checked={preferences.showPriority}
              disabled={savingPrefs}
              onChange={(e) => prefs({ showPriority: e.target.checked })}
            />
            Show priority
          </label>
          <p className={s.muted}>
            Drag the left edge of task details to resize the panel. Use the
            arrow keys on the resize handle for keyboard control.
          </p>
          <p className={s.muted}>
            Shortcuts: / to search tasks. Escape to close a panel.
          </p>
          {savingPrefs && <span role="status">Saving preferences…</span>}
        </div>
      </Drawer>
    </div>
  );
}

function TaskLine({
  task,
  preferences,
  today,
  busy,
  planned,
  onOpen,
  onComplete,
  onPlan,
  selectMode,
  checked,
  onSelect,
  extra,
}: {
  task: TodoTask;
  preferences: TodoPreferences;
  today: string;
  busy: boolean;
  planned: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onPlan: () => void;
  selectMode: boolean;
  checked: boolean;
  onSelect: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className={s.taskRow} data-done={task.status === "done"}>
      {selectMode && (
        <input
          type="checkbox"
          aria-label={`Select ${task.title}`}
          checked={checked}
          onChange={onSelect}
        />
      )}
      <button
        className={s.completeButton}
        disabled={busy}
        aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
        aria-pressed={task.status === "done"}
        onClick={onComplete}
      >
        {task.status === "done" && <TodoIcon name="check" />}
      </button>
      <div className={s.taskIdentity}>
        <button className={s.taskTitle} onClick={onOpen}>
          <strong>{task.title}</strong>
          <span>
            {task.is_personal ? (
              <>
                <TodoIcon name="lock" />
                Private
              </>
            ) : (
              "Assigned"
            )}
          </span>
        </button>
        {preferences.showClient && task.clientName && (
          <TooltipCard
            title={task.clientName}
            description="Client reference"
            trigger={
              <button
                className={s.clientPreview}
                aria-label={`Preview client ${task.clientName}`}
              >
                {task.clientName}
              </button>
            }
          >
            <p>
              <strong>{task.title}</strong>
            </p>
            <p>
              {TASK_STATUSES[task.status]} · {dateLabel(task.due_date, today)}
            </p>
            {task.client_id && (
              <Link href={`/clients/${encodeURIComponent(task.client_id)}`}>
                Open client ↗
              </Link>
            )}
          </TooltipCard>
        )}
      </div>
      <span className={s.statusBadge} data-status={task.status}>
        {TASK_STATUSES[task.status] ?? task.status}
      </span>
      {preferences.showPriority && (
        <span
          className={task.priority === "high" ? s.highPriority : s.priority}
        >
          {task.priority}
        </span>
      )}
      <span
        className={
          task.due_date && task.due_date < today && task.status !== "done"
            ? s.overdue
            : s.due
        }
      >
        {dateLabel(task.due_date, today)}
      </span>
      <AnimatedTooltip
        content={
          planned
            ? "Remove from today’s plan; the deadline stays unchanged"
            : "Add to today’s plan without changing the deadline"
        }
      >
        <button
          className={`${s.planButton} ${planned ? s.isPlanned : ""}`}
          disabled={busy || task.status === "done"}
          aria-label={`${planned ? "Remove from today" : "Plan for today"}: ${task.title}`}
          aria-pressed={planned}
          onClick={onPlan}
        >
          <TodoIcon name="calendar" />
        </button>
      </AnimatedTooltip>
      {extra}
    </div>
  );
}

function PlanList({
  tasks,
  render,
  onReorder,
  disabled,
  reduced,
}: {
  tasks: TodoTask[];
  render: (task: TodoTask, index: number) => ReactNode;
  onReorder: (ids: string[]) => Promise<void>;
  disabled: boolean;
  reduced: boolean;
}) {
  const [order, setOrder] = useState(tasks.map((t) => t.id));
  const incoming = tasks.map((t) => t.id).join(",");
  const [lastIncoming, setLastIncoming] = useState(incoming);
  if (incoming !== lastIncoming) {
    setLastIncoming(incoming);
    setOrder(tasks.map((t) => t.id));
  }
  return (
    <Reorder.Group
      axis="y"
      values={order}
      onReorder={setOrder}
      className={s.planList}
    >
      {order.map((id, index) => {
        const task = tasks.find((t) => t.id === id);
        return task ? (
          <DraggableTask
            key={id}
            id={id}
            title={task.title}
            disabled={disabled}
            reduced={reduced}
            onEnd={() => {
              if (order.join(",") !== incoming) void onReorder(order);
            }}
          >
            {render(task, index)}
          </DraggableTask>
        ) : null;
      })}
    </Reorder.Group>
  );
}
function DraggableTask({
  id,
  title,
  children,
  disabled,
  reduced,
  onEnd,
}: {
  id: string;
  title: string;
  children: ReactNode;
  disabled: boolean;
  reduced: boolean;
  onEnd: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onEnd}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 450, damping: 38 }
      }
      className={s.planItem}
    >
      <button
        className={s.dragHandle}
        aria-label={`Drag to reorder ${title}; use move up and down buttons for keyboard`}
        disabled={disabled}
        onPointerDown={(e) => {
          if (!disabled) controls.start(e);
        }}
        tabIndex={-1}
      >
        <TodoIcon name="grip" />
      </button>
      {children}
    </Reorder.Item>
  );
}
function Agenda({ actions, today }: { actions: TodoActions; today: string }) {
  const { data, error, loading, refresh } = useRemote(actions.agenda);
  return (
    <section className={s.agenda}>
      <div className={s.railHeading}>
        <h3>Agenda</h3>
        <button
          className={s.iconButton}
          onClick={refresh}
          aria-label="Refresh agenda"
          disabled={loading}
        >
          <TodoIcon name="refresh" />
        </button>
      </div>
      <p className={s.muted}>Upcoming · Microsoft 365</p>
      {loading && !data ? (
        <Loading label="Loading calendar" />
      ) : error ? (
        <ErrorNotice retry={refresh}>{error}</ErrorNotice>
      ) : data && "error" in data ? (
        <div className={s.railEmpty}>
          <p>{data.error}</p>
          <a href="/settings/mail">
            Mailbox settings <span>↗</span>
          </a>
        </div>
      ) : (
        data && (
          <>
            {data.appointments.length ? (
              data.appointments.slice(0, 8).map((event) => {
                const start = new Date(
                  /[zZ]|[+-]\d{2}:\d{2}$/.test(event.startIso)
                    ? event.startIso
                    : event.startIso + "Z",
                );
                return (
                  <div className={s.agendaEvent} key={event.id}>
                    <span className={s.agendaTime}>
                      {event.isAllDay
                        ? "All day"
                        : start.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                      <small>{dateLabel(localDate(start), today)}</small>
                    </span>
                    <div>
                      {safeExternalUrl(event.webLink) ? (
                        <a
                          href={safeExternalUrl(event.webLink)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {event.subject}
                          <TodoIcon name="external" />
                        </a>
                      ) : (
                        <strong>{event.subject}</strong>
                      )}
                      {event.location && <p>{event.location}</p>}
                    </div>
                  </div>
                );
              })
            ) : (
              <Empty title="No upcoming appointments" icon="calendar" />
            )}
            {data.dismissedCount > 0 && (
              <p className={s.muted}>
                {data.dismissedCount} appointment type(s) hidden by your
                existing calendar settings.
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}
