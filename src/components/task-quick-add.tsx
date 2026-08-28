"use client";

import { useActionState, useRef } from "react";
import type { FormState } from "@/app/(dashboard)/tasks/actions";

const initialState: FormState = { error: null };

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "general", label: "General" },
  { value: "email_follow_up", label: "Email follow-up" },
  { value: "quote_follow_up", label: "Quote follow-up" },
  { value: "urgent_alert", label: "Urgent alert" },
  { value: "new_project", label: "New project" },
  { value: "service_check", label: "Service check" },
  { value: "touchpoint_action", label: "Touchpoint action" },
];

export function TaskQuickAdd({
  clients,
  members,
  action,
}: {
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-6"
    >
      <input
        name="title"
        placeholder="What needs to happen?"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <select
        name="client_id"
        defaultValue=""
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">No client</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="assigned_to"
        defaultValue=""
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>
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
      <input
        type="date"
        name="due_date"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {state.error && (
        <p className="sm:col-span-6 text-sm text-red-600">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 sm:col-span-6 sm:w-fit"
      >
        {pending ? "Adding..." : "Add task"}
      </button>
    </form>
  );
}
