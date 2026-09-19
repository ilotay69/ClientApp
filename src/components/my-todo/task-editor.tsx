"use client";
import { useState } from "react";
import {
  TASK_STATUSES,
  type TodoTask,
  type TaskDraft,
  type TodoActions,
  type TodoPreferences,
  type TaskStatus,
} from "@/lib/my-todo-workspace";
import { Drawer, ErrorNotice, TodoIcon, Loading, useRemote } from "./ui";
import s from "./workspace.module.css";

export function TaskEditor({
  task,
  clients,
  actions,
  onSaved,
  onClose,
  preferences,
  onWidth,
  source,
  initialTitle = "",
  plannedOn = null,
  onPlan,
}: {
  task: TodoTask | null;
  clients: { id: string; name: string }[];
  actions: TodoActions;
  onSaved: (task: TodoTask) => void;
  onClose: () => void;
  preferences: TodoPreferences;
  onWidth: (width: number) => void;
  source?: { conversationId: string; messageId: string; subject: string };
  initialTitle?: string;
  plannedOn?: string | null;
  onPlan?: (date: string | null) => Promise<boolean>;
}) {
  const initial: TaskDraft = {
    title: task?.title ?? initialTitle,
    detail: task?.detail ?? "",
    priority: task?.priority ?? "low",
    due_date: task?.due_date ?? null,
    client_id: task?.client_id ?? null,
  };
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "open");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteDirty, setNoteDirty] = useState(false);
  const dirty =
    JSON.stringify(initial) !== JSON.stringify(draft) ||
    (task && status !== task.status);
  function close() {
    if (busy) return;
    if (
      (dirty || noteDirty) &&
      !window.confirm("Discard unsaved task changes?")
    )
      return;
    onClose();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      noteDirty &&
      !window.confirm(
        "Save task details and discard the unsent discussion note?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const result = task
        ? await actions.update(task.id, { ...draft, status }, task.updated_at)
        : await actions.create(draft, source);
      if (result.error !== undefined) setError(result.error);
      else onSaved(result.data);
    } catch {
      setError("Couldn't save. Your draft is still here; please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      open
      onClose={close}
      title={task ? "Task details" : "New private task"}
      description={
        task?.is_personal === false
          ? "Assigned task · changes are visible to your team"
          : "Only you can see this task"
      }
      width={preferences.panelWidth}
      onWidth={onWidth}
    >
      {task && onPlan && (
        <TaskPlan
          key={plannedOn ?? "unplanned"}
          value={plannedOn}
          save={onPlan}
        />
      )}
      <form onSubmit={save} className={s.editor}>
        {source && (
          <div className={s.sourceBox}>
            <TodoIcon name="inbox" />
            <div>
              <strong>From your mailbox</strong>
              <p>{source.subject}</p>
              <small>
                Creates one private task per conversation. No email is sent.
              </small>
            </div>
          </div>
        )}
        <label className={s.field}>
          Task title
          <input
            autoFocus
            required
            maxLength={240}
            placeholder="What needs to be done?"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        {task && (
          <label className={s.field}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {Object.entries(TASK_STATUSES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className={s.formGrid}>
          <label className={s.field}>
            Priority
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className={s.field}>
            Due date
            <input
              type="date"
              aria-label="Due date"
              value={draft.due_date ?? ""}
              onInput={(e) =>
                setDraft({ ...draft, due_date: e.currentTarget.value || null })
              }
              onChange={(e) =>
                setDraft({ ...draft, due_date: e.target.value || null })
              }
            />
            <button
              className={s.textButton}
              type="button"
              onClick={() => setDraft({ ...draft, due_date: null })}
            >
              No due date
            </button>
          </label>
        </div>
        <label className={s.field}>
          Client <span className={s.muted}>Optional</span>
          <select
            value={draft.client_id ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, client_id: e.target.value || null })
            }
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          Details
          <textarea
            rows={7}
            maxLength={10000}
            placeholder="Details, next steps, or context…"
            value={draft.detail}
            onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
          />
        </label>
        {task?.notes && (
          <div className={s.sourceBox}>
            <div>
              <strong>Existing notes</strong>
              <p className={s.prewrap}>{task.notes}</p>
            </div>
          </div>
        )}
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className={s.editorFooter}>
          <button
            type="button"
            className={s.button}
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className={s.primary} disabled={busy}>
            {busy ? "Saving…" : task ? "Save changes" : "Create private task"}
          </button>
        </div>
      </form>
      {task && (
        <TaskDiscussion id={task.id} actions={actions} onDirty={setNoteDirty} />
      )}
    </Drawer>
  );
}

function TaskPlan({
  value,
  save,
}: {
  value: string | null;
  save: (date: string | null) => Promise<boolean>;
}) {
  const [date, setDate] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className={s.taskPlan}>
      <label className={s.field}>
        Personal plan
        <input
          type="date"
          aria-label="Planned for"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
          onChange={(e) => setDate(e.target.value)}
        />
        <small>Separate from the deadline. Only visible to you.</small>
      </label>
      <button
        className={s.button}
        disabled={busy || date === (value ?? "")}
        onClick={async () => {
          setBusy(true);
          setError(false);
          const ok = await save(date || null);
          setBusy(false);
          if (!ok) setError(true);
        }}
      >
        {busy ? "Saving…" : "Save plan"}
      </button>
      {value && (
        <button
          className={s.textButton}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await save(null);
            if (!ok) {
              setError(true);
              setBusy(false);
            }
          }}
        >
          Remove from plan
        </button>
      )}
      {error && (
        <ErrorNotice>Couldn’t save the plan. Please try again.</ErrorNotice>
      )}
    </div>
  );
}
function TaskDiscussion({
  id,
  actions,
  onDirty,
}: {
  id: string;
  actions: TodoActions;
  onDirty: (dirty: boolean) => void;
}) {
  const remote = useRemote(() => actions.notes(id));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={s.discussion}>
      <h3>Discussion</h3>
      {remote.loading && !remote.data ? (
        <Loading label="Loading notes" />
      ) : remote.error || remote.data?.error ? (
        <ErrorNotice retry={remote.refresh}>
          {remote.error || remote.data?.error}
        </ErrorNotice>
      ) : remote.data?.data?.length ? (
        remote.data.data.map((note) => (
          <article key={note.id}>
            <header>
              <strong>{note.authorName ?? "Staff member"}</strong>
              <time>{new Date(note.created_at).toLocaleString()}</time>
            </header>
            <p className={s.prewrap}>{note.body}</p>
          </article>
        ))
      ) : (
        <p className={s.muted}>No discussion yet.</p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const result = await actions.addNote(id, body);
            if (result.error) setError(result.error);
            else {
              setBody("");
              onDirty(false);
              await remote.refresh();
            }
          } catch {
            setError("Couldn't save your note. Your draft is still here.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className={s.field}>
          Add a note
          <textarea
            rows={3}
            maxLength={10000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              onDirty(!!e.target.value.trim());
            }}
            required
          />
        </label>
        <button className={s.button} disabled={busy || !body.trim()}>
          {busy ? "Saving…" : "Add note"}
        </button>
        {error && <ErrorNotice>{error}</ErrorNotice>}
      </form>
    </section>
  );
}
