"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { FormState } from "@/app/(dashboard)/tasks/actions";

const initialState: FormState = { error: null };

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "general", label: "General" },
  { value: "internal", label: "Internal" },
  { value: "improvement", label: "Improvement" },
  { value: "email_follow_up", label: "Email follow-up" },
  { value: "quote_follow_up", label: "Quote follow-up" },
  { value: "urgent_alert", label: "Urgent alert" },
  { value: "new_project", label: "New project" },
  { value: "service_check", label: "Service check" },
  { value: "touchpoint_action", label: "Touchpoint action" },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "low", label: "Low priority" },
  { value: "medium", label: "Medium priority" },
  { value: "high", label: "High priority" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TaskQuickAdd({
  clients,
  projects,
  members,
  action,
  personal = false,
}: {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientName: string | null }[];
  members: { id: string; full_name: string }[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  /** A personal to-do: no client/project/assignee/kind fields, and never
   * visible to anyone but whoever creates it (enforced in the action, not
   * just here). */
  personal?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const defaultStart = useMemo(() => todayISO(), []);
  const [startDate, setStartDate] = useState(defaultStart);
  const [dueDate, setDueDate] = useState(() => addDaysISO(defaultStart, 30));
  const [dueDateTouched, setDueDateTouched] = useState(false);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
        setSelectedAssignees([]);
        const next = todayISO();
        setStartDate(next);
        setDueDate(addDaysISO(next, 30));
        setDueDateTouched(false);
      }}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4 lg:grid-cols-8"
    >
      {personal && <input type="hidden" name="is_personal" value="1" />}
      <input
        name="title"
        placeholder={personal ? "What do you need to do?" : "What needs to happen?"}
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      {!personal && (
        <select
          name="client_id"
          defaultValue=""
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No client (internal)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {!personal && (
        <select
          name="project_id"
          defaultValue=""
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.clientName ? ` — ${p.clientName}` : ""}
            </option>
          ))}
        </select>
      )}

      {!personal && (
        <details className="relative rounded-md border border-slate-300 px-3 py-2 text-sm">
          <summary className="cursor-pointer list-none">
            {selectedAssignees.length === 0
              ? "Unassigned"
              : `${selectedAssignees.length} assigned`}
          </summary>
          <div className="absolute z-10 mt-2 w-56 -translate-x-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="assignee_ids"
                  value={m.id}
                  checked={selectedAssignees.includes(m.id)}
                  onChange={(e) =>
                    setSelectedAssignees((prev) =>
                      e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                    )
                  }
                  className="rounded border-slate-300"
                />
                {m.full_name}
              </label>
            ))}
          </div>
        </details>
      )}

      {!personal && (
        <select
          name="kind"
          defaultValue="general"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      )}
      <select
        name="priority"
        defaultValue="medium"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2 lg:col-span-1">
        Start
        <input
          type="date"
          name="start_date"
          value={startDate}
          onChange={(e) => {
            const value = e.target.value;
            setStartDate(value);
            // Defaults due date to 30 days out unless the user has already
            // picked their own due date.
            if (!dueDateTouched && value) setDueDate(addDaysISO(value, 30));
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2 lg:col-span-1">
        Due
        <input
          type="date"
          name="due_date"
          value={dueDate}
          onChange={(e) => {
            setDueDateTouched(true);
            setDueDate(e.target.value);
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
      </label>
      <textarea
        name="notes"
        placeholder="Notes..."
        rows={1}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-4 lg:col-span-8"
      />

      {state.error && (
        <p className="sm:col-span-4 lg:col-span-8 text-sm text-red-600">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-4 sm:w-fit lg:col-span-8"
      >
        {pending ? "Adding..." : personal ? "Add to-do" : "Add task"}
      </button>
    </form>
  );
}
