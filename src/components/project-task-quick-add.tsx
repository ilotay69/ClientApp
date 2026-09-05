"use client";

import { useActionState, useRef, useState } from "react";
import type { FormState } from "@/app/(dashboard)/tasks/actions";

const initialState: FormState = { error: null };

/** Minimal add-task form for a project's own expanded row — client and
 * project are already fixed by context, so unlike the full Tasks page's
 * quick-add there's nothing to pick, just title/assignees/priority. Posts
 * straight to the same createTask action Tasks itself uses. */
export function ProjectTaskQuickAdd({
  clientId,
  projectId,
  members,
  action,
}: {
  clientId: string;
  projectId: string;
  members: { id: string; full_name: string }[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
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
      className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2"
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="project_id" value={projectId} />
      <input
        name="title"
        placeholder="What needs to happen?"
        required
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <details className="relative rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <summary className="cursor-pointer list-none">
          {selectedAssignees.length === 0 ? "Unassigned" : `${selectedAssignees.length} assigned`}
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
      <select
        name="priority"
        defaultValue="low"
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="low">Low priority</option>
        <option value="high">High priority</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add task"}
      </button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
