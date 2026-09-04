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
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <Label>What&apos;s being requested?</Label>
        <input
          name="title"
          placeholder="e.g. 10x Dell laptops for Acme Corp"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Client</Label>
          <select
            name="client_id"
            defaultValue={defaultClientId}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">No client (internal)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Assigned to</Label>
          <select
            name="assigned_to"
            defaultValue={defaultAssignedTo}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Requested by</Label>
          <input
            name="requested_by_name"
            defaultValue={defaultRequestedByName}
            placeholder="Name (optional)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <Label>Their email</Label>
          <input
            name="requested_by_email"
            type="email"
            defaultValue={defaultRequestedByEmail}
            placeholder="Email (optional)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <Label>Detail</Label>
        <textarea
          name="detail"
          placeholder="Detail (optional)..."
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add request"}
      </button>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-medium text-slate-700">{children}</p>;
}
