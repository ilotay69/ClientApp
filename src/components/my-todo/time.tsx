"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeOffRequestCard } from "@/components/time-off-request-card";
import {
  weekDates,
  shiftDate,
  dateLabel,
  isDate,
  signedTotal,
  type TodoActions,
  type HoursEntry,
  type Result,
  type TimeData,
} from "@/lib/my-todo-workspace";
import { useRemote, Drawer, Empty, ErrorNotice, Loading, TodoIcon } from "./ui";
import s from "./workspace.module.css";
import { AnimatedTabs } from "../ui/animated-tabs";
import { StatefulButton } from "../ui/stateful-button";
export function TodoTime({
  actions,
  today,
  initialTab,
}: {
  actions: TodoActions;
  today: string;
  initialTab: "hours" | "leave";
}) {
  const params = useSearchParams();
  const raw = params.get("week");
  const anchor = isDate(raw) ? raw : today;
  const [tab, setTab] = useState(initialTab);
  function change(date: string) {
    const q = new URLSearchParams(window.location.search);
    q.set("week", date);
    window.history.pushState(null, "", `?${q}`);
  }
  return (
    <section className={s.timeArea}>
      <div className={s.sectionHeading}>
        <div>
          <h2>Time & leave</h2>
          <p>
            Self-reported hours and leave requests. Separate from Autotask time
            entries.
          </p>
        </div>
        <AnimatedTabs
          className={s.segmented}
          label="Time and leave view"
          value={tab}
          onChange={setTab}
          items={[
            { value: "hours", label: "Hours" },
            { value: "leave", label: "Leave" },
          ]}
        />
      </div>
      <TimeContent
        key={anchor}
        actions={actions}
        today={today}
        anchor={anchor}
        tab={tab}
        change={change}
      />
    </section>
  );
}
function TimeContent({
  actions,
  today,
  anchor,
  tab,
  change,
}: {
  actions: TodoActions;
  today: string;
  anchor: string;
  tab: "hours" | "leave";
  change: (date: string) => void;
}) {
  const days = weekDates(anchor);
  const month = anchor.slice(0, 7);
  const remote = useRemote(async (): Promise<Result<TimeData>> => {
    const months = [...new Set([month, ...days.map((d) => d.slice(0, 7))])];
    const results = await Promise.all(months.map((m) => actions.time(m)));
    const failure = results.find((r) => r.error);
    if (failure?.error) return { error: failure.error };
    const main = results[0].data!;
    return {
      data: { ...main, hours: results.flatMap((r) => r.data?.hours ?? []) },
    };
  });
  const data = remote.data?.data;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [request, setRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveType, setLeaveType] = useState("vacation");
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const result = await actions.leave(form);
      if (result.error !== undefined) setError(result.error);
      else {
        setRequest(false);
        setSuccess("Leave submitted");
        await remote.refresh();
      }
    } catch {
      setError("Couldn't submit your leave. Your draft is still here.");
    } finally {
      setBusy(false);
    }
  }
  async function decide(id: string, decision: "approved" | "declined") {
    try {
      const result = await actions.decideLeave(id, decision);
      if (result.error !== undefined) setError(result.error);
      else {
        setSuccess(`Request ${decision}`);
        await remote.refresh();
      }
    } catch {
      setError("Couldn't update the request. Please refresh.");
    }
  }
  async function withdraw(id: string) {
    try {
      const result = await actions.withdrawLeave(id);
      if (result.error !== undefined) setError(result.error);
      else {
        setSuccess("Request withdrawn");
        await remote.refresh();
      }
    } catch {
      setError("Couldn't withdraw this request. Please refresh.");
    }
  }
  const monthHours = (data?.hours ?? []).filter((e) =>
    e.work_date.startsWith(month),
  );
  const halves = [
    monthHours.filter((e) => Number(e.work_date.slice(8)) <= 15),
    monthHours.filter((e) => Number(e.work_date.slice(8)) > 15),
  ];
  return (
    <>
      <div className={s.timeNavigation}>
        <div className={s.actions}>
          <button
            className={s.iconButton}
            aria-label="Previous week"
            onClick={() => change(shiftDate(anchor, -7))}
          >
            ←
          </button>
          <strong>
            {dateLabel(days[0])} – {dateLabel(days[6])}, {anchor.slice(0, 4)}
          </strong>
          <button
            className={s.iconButton}
            aria-label="Next week"
            onClick={() => change(shiftDate(anchor, 7))}
          >
            →
          </button>
          <button className={s.textButton} onClick={() => change(today)}>
            This week
          </button>
        </div>
        <input
          aria-label="Jump to month"
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) change(e.target.value + "-01");
          }}
        />
      </div>
      {(error || remote.error || remote.data?.error) && (
        <ErrorNotice retry={remote.refresh}>
          {error || remote.error || remote.data?.error}
        </ErrorNotice>
      )}
      {success && (
        <p role="status" className={s.success}>
          {success}
        </p>
      )}
      {remote.loading && !data ? (
        <Loading label="Loading time and leave" />
      ) : data && tab === "hours" ? (
        <>
          <div className={s.payrollCards}>
            {halves.map((entries, index) => (
              <div className={s.payrollCard} key={index}>
                <span>
                  {index === 0 ? "1–15" : "16–month end"} ·{" "}
                  {new Date(month + "-01T12:00:00Z").toLocaleDateString(
                    "en-CA",
                    { month: "long", timeZone: "UTC" },
                  )}
                </span>
                <strong>
                  {signedTotal(entries).toFixed(2)}
                  <small> hours</small>
                </strong>
                <p>Regular + after hours − taken off</p>
              </div>
            ))}
            <div className={s.payrollCard}>
              <span>Selected week</span>
              <strong>
                {signedTotal(
                  data.hours.filter((e) => days.includes(e.work_date)),
                ).toFixed(2)}
                <small> hours</small>
              </strong>
              <p>Self-reported net total</p>
            </div>
          </div>
          <div className={`${s.card} ${s.timesheetWrap}`}>
            <table className={s.timesheet}>
              <caption>
                Weekly hours · edit a cell and leave it to save. Enter 0 to
                clear an entry.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  {days.map((day) => (
                    <th scope="col" data-today={day === today} key={day}>
                      {new Date(day + "T12:00:00Z").toLocaleDateString(
                        "en-CA",
                        { weekday: "short", timeZone: "UTC" },
                      )}
                      <span>{dateLabel(day)}</span>
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["regular", "Regular"],
                    ["after_hours", "After hours"],
                    ["taken_off", "Taken off (−)"],
                  ] as [HoursEntry["label"], string][]
                ).map(([label, title]) => (
                  <tr key={label}>
                    <th scope="row">{title}</th>
                    {days.map((day) => {
                      const entry = data.hours.find(
                        (e) => e.work_date === day && e.label === label,
                      );
                      return (
                        <td key={day} data-today={day === today}>
                          <HoursCell
                            key={`${day}-${label}-${entry?.hours ?? 0}`}
                            value={entry?.hours ?? 0}
                            label={`${title} hours for ${day}`}
                            save={async (value) => {
                              const result = await actions.hours(
                                day,
                                label,
                                value,
                              );
                              if (result.error !== undefined)
                                return result.error;
                              setSuccess(
                                `Saved ${title.toLowerCase()} hours for ${dateLabel(day)}`,
                              );
                              await remote.refresh();
                              return null;
                            }}
                          />
                        </td>
                      );
                    })}
                    <td>
                      {data.hours
                        .filter(
                          (e) =>
                            e.label === label && days.includes(e.work_date),
                        )
                        .reduce((sum, e) => sum + e.hours, 0)
                        .toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Net hours</th>
                  {days.map((day) => (
                    <td key={day}>
                      {signedTotal(
                        data.hours.filter((e) => e.work_date === day),
                      ).toFixed(2)}
                    </td>
                  ))}
                  <td>
                    {signedTotal(
                      data.hours.filter((e) => days.includes(e.work_date)),
                    ).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={s.sourceNote}>
            Taken off reduces the total. These figures are not an availability
            or capacity estimate. Payroll periods remain the 1st–15th and
            16th–month end.
          </p>
          {data.isOwner && (
            <details className={s.reviewResults}>
              <summary>
                Team hours · {month}
                <span>Owner only · read-only</span>
              </summary>
              {data.teamHours.length ? (
                <div className={s.teamTable}>
                  {data.teamHours.map((e) => (
                    <div key={e.id}>
                      <strong>{e.userName}</strong>
                      <span>{dateLabel(e.work_date)}</span>
                      <span>{e.label.replaceAll("_", " ")}</span>
                      <span>{signedTotal([e]).toFixed(2)}h</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No team hours logged this month.</p>
              )}
            </details>
          )}
        </>
      ) : (
        data && (
          <div className={s.leaveGrid}>
            <div>
              <div className={s.sectionHeading}>
                <h2>
                  My requests <span>{data.requests.length}</span>
                </h2>
                <button className={s.primary} onClick={() => setRequest(true)}>
                  <TodoIcon name="plus" />
                  Request leave
                </button>
              </div>
              <div className={s.card}>
                {data.requests.length ? (
                  data.requests.map((r) => (
                    <div className={s.leaveCard} key={r.id}>
                      <TimeOffRequestCard
                        request={r}
                        isOwner={data.isOwner}
                        currentUserId={data.userId}
                        showRequester={false}
                        decideAction={decide}
                        withdrawAction={withdraw}
                        addNoteAction={async (_, form) => {
                          try {
                            const result = await actions.leaveNote(form);
                            if (!result.error) await remote.refresh();
                            return result;
                          } catch {
                            return { error: "Couldn't add your note." };
                          }
                        }}
                      />
                      {data.isOwner && r.status === "pending" && (
                        <button
                          className={s.textButton}
                          onClick={() => {
                            if (
                              window.confirm("Withdraw your pending request?")
                            )
                              void withdraw(r.id);
                          }}
                        >
                          Withdraw my request
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty title="No leave requests" icon="calendar" />
                )}
              </div>
              {data.isOwner && (
                <>
                  <div className={s.sectionHeading}>
                    <h2>
                      Team requests{" "}
                      <span>
                        {
                          data.teamRequests.filter(
                            (r) => r.status === "pending",
                          ).length
                        }{" "}
                        pending
                      </span>
                    </h2>
                  </div>
                  <div className={s.card}>
                    {data.teamRequests.length ? (
                      data.teamRequests.map((r) => (
                        <div key={r.id} className={s.leaveCard}>
                          <TimeOffRequestCard
                            request={r}
                            isOwner
                            currentUserId={data.userId}
                            showRequester
                            decideAction={decide}
                            withdrawAction={withdraw}
                            addNoteAction={async (_, form) => {
                              try {
                                const result = await actions.leaveNote(form);
                                if (!result.error) await remote.refresh();
                                return result;
                              } catch {
                                return { error: "Couldn't add your note." };
                              }
                            }}
                          />
                        </div>
                      ))
                    ) : (
                      <Empty title="No team requests" />
                    )}
                  </div>
                </>
              )}
            </div>
            <aside className={s.summaryCard}>
              <h3>Team availability · {month}</h3>
              <p className={s.muted}>
                Approved absences. Reasons and leave types are not shown here.
              </p>
              {data.absences.length ? (
                data.absences.map((a) => (
                  <div className={s.absence} key={a.id}>
                    <strong>{a.name}</strong>
                    <span>Unavailable</span>
                    <small>
                      {dateLabel(a.start)} – {dateLabel(a.end)}
                    </small>
                  </div>
                ))
              ) : (
                <p className={s.muted}>No approved absences this month.</p>
              )}
            </aside>
          </div>
        )
      )}
      <Drawer
        open={request}
        onClose={() => {
          if (!busy) setRequest(false);
        }}
        title="Request leave"
        description="Sent to the owners for review"
      >
        <form className={s.editor} onSubmit={create}>
          <label className={s.field}>
            Type
            <select
              name="type"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              <option value="vacation">Vacation</option>
              <option value="sick">Sick</option>
            </select>
          </label>
          <div className={s.formGrid}>
            <label className={s.field}>
              Start date
              <input
                type="date"
                name="start_date"
                required
                defaultValue={today}
              />
            </label>
            <label className={s.field}>
              End date
              <input
                type="date"
                name="end_date"
                required
                defaultValue={today}
              />
            </label>
          </div>
          <label className={s.field}>
            Reason <span className={s.muted}>Optional · visible to owners</span>
            <textarea name="reason" rows={4} maxLength={2000} />
          </label>
          <p className={s.sourceNote}>
            {leaveType === "sick"
              ? "Sick leave is recorded automatically and notifies the owners; no approval is required."
              : "Vacation requests remain pending until an owner approves or declines them."}
          </p>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <StatefulButton
            type="submit"
            className={s.primary}
            status={busy ? "pending" : error ? "error" : "idle"}
            pendingLabel="Submitting…"
            successLabel="Submitted"
            errorLabel="Retry request"
          >
            Submit request
          </StatefulButton>
        </form>
      </Drawer>
    </>
  );
}
function HoursCell({
  value,
  label,
  save,
}: {
  value: number;
  label: string;
  save: (value: number) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  const [saved, setSaved] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function commit() {
    const next = Number(draft);
    if (next === saved) return;
    if (!Number.isFinite(next) || next < 0 || next > 24) {
      setError("Use 0–24 hours");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const error = await save(next);
      if (error) setError(error);
      else setSaved(next);
    } catch {
      setError("Not saved. Retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <input
        type="number"
        min={0}
        max={24}
        step="0.25"
        aria-label={label}
        aria-invalid={!!error}
        value={draft}
        placeholder="—"
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {busy && <small role="status">Saving</small>}
      {error && (
        <small role="alert" className={s.danger}>
          {error}
          <button onClick={commit}>Retry</button>
        </small>
      )}
    </div>
  );
}
