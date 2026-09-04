"use client";

import { useActionState, useRef, useState } from "react";
import type { FormState } from "@/app/(dashboard)/tasks/actions";

const initialState: FormState = { error: null };

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "low", label: "Low priority" },
  { value: "high", label: "High priority" },
];

export function TaskQuickAdd({
  clients,
  projects,
  members,
  action,
  personal = false,
  defaultProjectId = "",
  defaultClientId = "",
}: {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientName: string | null }[];
  members: { id: string; full_name: string }[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  /** A personal to-do: no client/project/assignee/kind fields, and never
   * visible to anyone but whoever creates it (enforced in the action, not
   * just here). */
  personal?: boolean;
  /** Pre-selects the project (and its client) — for arriving here via a
   * project's own "+ Add" link, so adding a task doesn't mean hunting it
   * out of every project in the dropdown. */
  defaultProjectId?: string;
  defaultClientId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
        setSelectedAssignees([]);
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
          defaultValue={defaultClientId}
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
          defaultValue={defaultProjectId}
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

      <select
        name="priority"
        defaultValue="low"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
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
