"use client";
import { useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useReducedMotion } from "motion/react";
import {
  dateLabel,
  shiftDate,
  safeExternalUrl,
  type TodoActions,
  type ItemState,
  type TodoPreferences,
  type TodoTask,
  type MailThread,
} from "@/lib/my-todo-workspace";
import type { MailboxReviewResult } from "@/lib/mailbox-review";
import { TaskEditor } from "./task-editor";
import { useRemote, Drawer, Empty, ErrorNotice, Loading, TodoIcon } from "./ui";
import s from "./workspace.module.css";
type InboxFilter = "received" | "sent" | "tasks" | "snoozed" | "dismissed";
export function TodoInbox({
  actions,
  items,
  plan,
  today,
  clients,
  preferences,
  onWidth,
  onTask,
}: {
  actions: TodoActions;
  items: ItemState[];
  plan: (
    key: string,
    date: string | null,
    position?: number,
    snooze?: string | null,
  ) => Promise<boolean>;
  today: string;
  clients: { id: string; name: string }[];
  preferences: TodoPreferences;
  onWidth: (width: number) => void;
  onTask: (task: TodoTask) => void;
}) {
  const remote = useRemote(actions.inbox);
  const data = remote.data?.data;
  const [filter, setFilter] = useState<InboxFilter>("received");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [source, setSource] = useState<MailThread | null>(null);
  const [review, setReview] = useState<MailboxReviewResult | null>(null);
  const reduced = useReducedMotion();
  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const r = await actions.sync();
      if ("error" in r) setError(r.error);
      else await remote.refresh();
    } catch {
      setError("Couldn't sync your mailbox. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function analyze(form?: FormData) {
    if (!data) return;
    setAnalyzing(true);
    setError(null);
    const request = form ?? new FormData();
    if (!form) {
      request.set("days", String(data.preferences.days));
      request.set("excludes", data.preferences.excludes);
      request.set("neverStore", data.preferences.neverStore);
    }
    try {
      const r = await actions.review(request);
      if (r.error) setError(r.error);
      else {
        setReview(r.result);
        setSettings(false);
        await remote.refresh();
      }
    } catch {
      setError("Mailbox analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }
  async function dismiss(thread: MailThread) {
    setBusy(true);
    setError(null);
    try {
      const r = await actions.dismiss(
        thread.conversationId,
        thread.messageId,
        !thread.dismissed,
      );
      if (r.error) setError(r.error);
      else await remote.refresh();
    } catch {
      setError("Couldn't update this thread. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const state = new Map(items.map((i) => [i.item_key, i]));
  const threads = (data?.threads ?? []).filter((t) => {
    const snoozed =
      (state.get(`mail:${t.messageId}`)?.snoozed_until ?? "") > today;
    return (
      (filter === "dismissed"
        ? t.dismissed
        : filter === "snoozed"
          ? snoozed && !t.dismissed
          : !snoozed &&
            !t.dismissed &&
            (filter === "tasks" ? !!t.taskId : t.direction === filter)) &&
      (!q ||
        `${t.subject} ${t.contact} ${t.preview}`
          .toLowerCase()
          .includes(q.toLowerCase()))
    );
  });
  return (
    <section className={s.inbox}>
      <div className={s.sectionHeading}>
        <div>
          <h2>Mailbox review</h2>
          <p>
            {data?.syncedAt
              ? `Snapshot synced ${new Date(data.syncedAt).toLocaleString()}`
              : "Mailbox snapshot · not a live inbox"}
          </p>
        </div>
        <div className={s.actions}>
          <button
            className={s.button}
            disabled={busy || analyzing || !data?.connected}
            onClick={sync}
          >
            <TodoIcon name="refresh" />
            {busy ? "Updating…" : "Sync mailbox"}
          </button>
          <button
            className={s.button}
            disabled={!data?.connected || analyzing}
            onClick={() => setSettings(true)}
          >
            <TodoIcon name="settings" />
            Review settings
          </button>
          <button
            className={s.primary}
            disabled={!data?.connected || analyzing || busy}
            onClick={() => analyze()}
          >
            {analyzing ? "Analyzing…" : "Analyze mailbox"}
          </button>
        </div>
      </div>
      <p className={s.sourceNote}>
        Received and waiting are based on the latest stored message, not an AI
        decision. Analysis uses your configured AI provider when available.
        Nothing is sent automatically.
      </p>
      {(error || remote.error || remote.data?.error) && (
        <ErrorNotice retry={remote.refresh}>
          {error || remote.error || remote.data?.error}
        </ErrorNotice>
      )}
      {remote.loading && !data ? (
        <Loading label="Loading mailbox" />
      ) : data && !data.connected ? (
        <div className={s.card}>
          <Empty
            title="Connect your mailbox"
            icon="inbox"
            action={
              <a className={s.button} href="/settings/mail">
                Mailbox settings <TodoIcon name="external" />
              </a>
            }
          >
            Connect Microsoft 365 to review conversations and create private
            follow-up tasks.
          </Empty>
        </div>
      ) : (
        data && (
          <>
            <div className={s.toolbar}>
              <label className={s.search}>
                <TodoIcon name="search" />
                <input
                  aria-label="Search mailbox review"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search conversations…"
                />
              </label>
              <div className={s.pills}>
                {(
                  [
                    ["received", "Received"],
                    ["sent", "Waiting"],
                    ["tasks", "Linked tasks"],
                    ["snoozed", "Snoozed"],
                    ["dismissed", "Dismissed"],
                  ] as [InboxFilter, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {analyzing && (
              <div className={s.analyzing} role="status">
                <ThinkingOrb state="searching" size={64} paused={!!reduced} />
                <div>
                  <strong>Analyzing your mailbox</strong>
                  <p>Checking the stored snapshot for follow-ups.</p>
                </div>
              </div>
            )}
            {review && (
              <details className={s.reviewResults} open>
                <summary>
                  Analysis results{" "}
                  <span>
                    {review.aiAvailable
                      ? "AI-assisted · verify against source"
                      : "Rule-based review"}
                  </span>
                </summary>
                {review.narrative.length ? (
                  review.narrative.map((item, index) => {
                    const thread = data.threads.find(
                      (t) =>
                        t.conversationId === item.conversationId &&
                        t.messageId === item.graphMessageId,
                    );
                    return (
                      <div key={`${item.conversationId}-${index}`}>
                        <p>{item.text}</p>
                        {thread && safeExternalUrl(thread.webLink) && (
                          <a
                            href={safeExternalUrl(thread.webLink)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View source in Outlook ↗
                          </a>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p>No follow-ups found within the review settings.</p>
                )}
                {review.suggestedActions.length > 0 && (
                  <div>
                    <h3>Suggested actions</h3>
                    <ul>
                      {review.suggestedActions.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {review.focusIgnored && (
                  <p>
                    Your focus question was not applied because no AI provider
                    is configured.
                  </p>
                )}
              </details>
            )}
            {data.truncated && (
              <p className={s.warning}>
                Showing conversations from the latest 1,000 stored messages.
                Narrow the review lookback in settings for older threads.
              </p>
            )}
            <div className={s.mailGrid}>
              {threads.length ? (
                threads.map((thread) => (
                  <article className={s.mailCard} key={thread.conversationId}>
                    <div className={s.mailMeta}>
                      <span>
                        {thread.direction === "sent"
                          ? "Last message sent"
                          : "Last message received"}
                      </span>
                      <time>
                        {new Date(thread.receivedAt).toLocaleDateString()}
                      </time>
                    </div>
                    <h3>{thread.subject}</h3>
                    <p className={s.contact}>{thread.contact}</p>
                    <p className={s.mailPreview}>
                      {thread.preview ||
                        "No message preview stored. Open Outlook to read the source."}
                    </p>
                    <div className={s.mailFooter}>
                      {safeExternalUrl(thread.webLink) && (
                        <a
                          className={s.textButton}
                          href={safeExternalUrl(thread.webLink)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Outlook <TodoIcon name="external" />
                        </a>
                      )}
                      {thread.taskId ? (
                        <a
                          className={s.linkedTask}
                          href={`/my-todo?view=new&tab=tasks&item=${encodeURIComponent(thread.taskId)}`}
                        >
                          <TodoIcon name="check" />
                          Private task
                        </a>
                      ) : (
                        <button
                          className={s.button}
                          disabled={busy || analyzing}
                          onClick={() => setSource(thread)}
                        >
                          <TodoIcon name="plus" />
                          Create task
                        </button>
                      )}
                    </div>
                    <div className={s.mailSecondary}>
                      {filter === "snoozed" ? (
                        <button
                          disabled={busy}
                          onClick={() =>
                            plan(`mail:${thread.messageId}`, null, 0, null)
                          }
                        >
                          Unsnooze ·{" "}
                          {dateLabel(
                            state.get(`mail:${thread.messageId}`)
                              ?.snoozed_until ?? null,
                            today,
                          )}
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() =>
                            plan(
                              `mail:${thread.messageId}`,
                              null,
                              0,
                              shiftDate(today, 1),
                            )
                          }
                        >
                          Snooze until tomorrow
                        </button>
                      )}
                      <button disabled={busy} onClick={() => dismiss(thread)}>
                        {thread.dismissed
                          ? "Restore to review"
                          : "Dismiss from review"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className={s.card}>
                  <Empty title="No conversations in this view" icon="inbox">
                    Try another filter or sync your mailbox. This does not mean
                    your mailbox is empty.
                  </Empty>
                </div>
              )}
            </div>
          </>
        )
      )}
      {source && (
        <TaskEditor
          task={null}
          initialTitle={`Follow up: ${source.subject}`.slice(0, 240)}
          source={{
            conversationId: source.conversationId,
            messageId: source.messageId,
            subject: source.subject,
          }}
          clients={clients}
          actions={actions}
          preferences={preferences}
          onWidth={onWidth}
          onClose={() => setSource(null)}
          onSaved={(task) => {
            setSource(null);
            onTask(task);
            void remote.refresh();
          }}
        />
      )}
      <Drawer
        open={settings}
        onClose={() => {
          if (!analyzing) setSettings(false);
        }}
        title="Mailbox review settings"
        description="Only your mailbox is included"
      >
        <form
          key={data?.syncedAt ?? "settings"}
          className={s.editor}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const neverStore = String(form.get("neverStore") ?? "").trim();
            if (
              neverStore !== (data?.preferences.neverStore ?? "").trim() &&
              neverStore &&
              !window.confirm(
                "Saving this exclusion removes matching messages from the app’s stored snapshot. Your Outlook messages are not deleted. Continue?",
              )
            )
              return;
            void analyze(form);
          }}
        >
          <label className={s.field}>
            Review the last (days)
            <input
              type="number"
              min={1}
              max={90}
              name="days"
              defaultValue={data?.preferences.days ?? 30}
              required
            />
          </label>
          <label className={s.field}>
            Focus question <span className={s.muted}>Optional · not saved</span>
            <textarea
              name="focus"
              rows={3}
              placeholder="e.g. Which client questions need a reply?"
            />
          </label>
          <label className={s.field}>
            Exclude from review
            <textarea
              name="excludes"
              rows={3}
              defaultValue={data?.preferences.excludes ?? ""}
            />
            <small>
              Comma-separated sender names, addresses, or subjects. Still stored
              in the snapshot.
            </small>
          </label>
          <label className={s.field}>
            Never store these senders
            <textarea
              name="neverStore"
              rows={3}
              defaultValue={data?.preferences.neverStore ?? ""}
            />
            <small>
              Matching sender names or addresses are removed from the app’s
              snapshot and excluded from future syncs. Outlook is unchanged.
            </small>
          </label>
          <div className={s.sourceBox}>
            <TodoIcon name="lock" />
            <p>
              Analysis uses stored message metadata and previews. With an AI
              provider configured, review context is sent to that provider.
              Private tasks are created only after you review and confirm them.
            </p>
          </div>
          <button className={s.primary} disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Save settings & analyze"}
          </button>
          {error && <ErrorNotice>{error}</ErrorNotice>}
        </form>
      </Drawer>
    </section>
  );
}
