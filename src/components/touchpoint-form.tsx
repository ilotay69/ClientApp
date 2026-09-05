"use client";

import { useActionState } from "react";
import type { Touchpoint } from "@/lib/types";
import type { FormState } from "@/app/(dashboard)/touchpoints/actions";

const initialState: FormState = { error: null };

export function TouchpointForm({
  touchpoint,
  clients,
  members,
  defaultClientId,
  action,
  submitLabel,
}: {
  touchpoint?: Touchpoint;
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
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
          defaultValue={touchpoint?.client_id ?? defaultClientId ?? ""}
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
        <label className="block text-sm font-medium text-slate-700">How contacted</label>
        <select
          name="contact_method"
          required
          defaultValue={touchpoint?.contact_method ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="" disabled>
            Select one
          </option>
          <option value="email">Email</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Assigned to</label>
        <select
          name="owner_id"
          defaultValue={touchpoint?.owner_id ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Outcome</label>
        <p className="mt-0.5 text-xs text-slate-500">
          What happened — any positives or negatives worth remembering next
          time you talk to this client.
        </p>
        <textarea
          name="outcome"
          rows={6}
          defaultValue={touchpoint?.outcome ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Next contact date</label>
        <input
          type="date"
          name="due_date"
          required
          defaultValue={touchpoint?.due_date ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Next action</label>
        <p className="mt-0.5 text-xs text-slate-500">
          What needs to happen before then. If set, it&apos;s tracked as an
          open task assigned to the same person as this touchpoint.
        </p>
        <textarea
          name="next_action"
          rows={2}
          defaultValue={touchpoint?.next_action ?? ""}
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
