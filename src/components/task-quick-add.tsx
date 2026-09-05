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
  projects: { id: string; name: string; clientName: string | null; clientId: string | null }[];
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
  const [selectedClientId, setSelectedClientId] = useState(defaultClientId);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId);

  // Client <-> project are cross-filtered: picking a client narrows the
  // project list to that client's projects (every project belongs to
  // exactly one client), and picking a project narrows the client list
  // down to (and selects) that project's own client.
  const visibleProjects = selectedClientId
    ? projects.filter((p) => p.clientId === selectedClientId)
    : projects;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const visibleClients = selectedProjectId
    ? clients.filter((c) => c.id === selectedProject?.clientId)
    : clients;

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
        setSelectedAssignees([]);
        setSelectedClientId(defaultClientId);
        setSelectedProjectId(defaultProjectId);
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
          value={selectedClientId}
          onChange={(e) => {
            const clientId = e.target.value;
            setSelectedClientId(clientId);
            if (selectedProject && selectedProject.clientId !== clientId) {
              setSelectedProjectId("");
            }
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No client (internal)</option>
          {visibleClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {!personal && (
        <select
          name="project_id"
          value={selectedProjectId}
          onChange={(e) => {
            const projectId = e.target.value;
            setSelectedProjectId(projectId);
            const project = projects.find((p) => p.id === projectId);
            if (project?.clientId) setSelectedClientId(project.clientId);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No project</option>
          {visibleProjects.map((p) => (
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
