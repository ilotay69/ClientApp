"use client";

import { useActionState, useRef } from "react";
import type { FormState } from "@/app/(dashboard)/sales-requests/actions";

const initialState: FormState = { error: null };

export function SalesRequestQuickAdd({
  clients,
  members,
  action,
  defaultClientId = "",
  defaultAssignedTo = "",
  defaultRequestedByName = "",
  defaultRequestedByEmail = "",
}: {
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  defaultClientId?: string;
  /** Defaults to whoever's creating the request — still editable, e.g. to
   * hand it straight to someone else instead. */
  defaultAssignedTo?: string;
  defaultRequestedByName?: string;
  defaultRequestedByEmail?: string;
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
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-6"
    >
      <input
        name="title"
        placeholder="What's being requested?"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
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
      <select
        name="assigned_to"
        defaultValue={defaultAssignedTo}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>
      <input
        name="requested_by_name"
        defaultValue={defaultRequestedByName}
        placeholder="Requested by (optional)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="requested_by_email"
        type="email"
        defaultValue={defaultRequestedByEmail}
        placeholder="Their email (optional)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        name="detail"
        placeholder="Detail (optional)..."
        rows={1}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3 lg:col-span-6"
      />

      {state.error && (
        <p className="text-sm text-red-600 sm:col-span-3 lg:col-span-6">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-3 sm:w-fit lg:col-span-6"
      >
        {pending ? "Adding..." : "Add request"}
      </button>
    </form>
  );
}
