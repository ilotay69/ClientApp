"use client";

import { useActionState } from "react";
import type { Project } from "@/lib/types";
import type { FormState } from "@/app/(dashboard)/projects/actions";

const initialState: FormState = { error: null };

const STATUS_OPTIONS = ["planning", "active", "on_hold", "completed", "cancelled"];

export function ProjectForm({
  project,
  clients,
  defaultClientId,
  action,
  submitLabel,
}: {
  project?: Project;
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Client</label>
        <select
          name="client_id"
          required
          defaultValue={project?.client_id ?? defaultClientId ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="" disabled>
            Select a client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Project name</label>
        <input
          type="text"
          name="name"
          required
          defaultValue={project?.name}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Status</label>
        <select
          name="status"
          defaultValue={project?.status ?? "planning"}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Start date</label>
          <input
            type="date"
            name="start_date"
            defaultValue={project?.start_date ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Target end date</label>
          <input
            type="date"
            name="target_end_date"
            defaultValue={project?.target_end_date ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={project?.notes ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
