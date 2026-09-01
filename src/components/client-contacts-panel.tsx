"use client";

import { useActionState, useRef } from "react";
import { DeleteButton } from "@/components/delete-button";
import type { FormState } from "@/app/(dashboard)/clients/actions";

const initialState: FormState = { error: null };

export function ClientContactsPanel({
  contacts,
  canManageClients,
  addAction,
  removeAction,
}: {
  contacts: { id: string; name: string; email: string | null }[];
  canManageClients: boolean;
  addAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (contactId: string) => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(addAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Contacts</h2>

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-500">No additional contacts yet.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                {c.email && <p className="truncate text-xs text-slate-500">{c.email}</p>}
              </div>
              {canManageClients && (
                <DeleteButton
                  action={removeAction.bind(null, c.id)}
                  confirmText={`Remove ${c.name} from this client's contacts?`}
                  label="Remove"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canManageClients && (
        <form
          ref={formRef}
          action={async (formData: FormData) => {
            await formAction(formData);
            formRef.current?.reset();
          }}
          className="mt-4 flex flex-wrap items-start gap-2"
        >
          <input
            name="name"
            placeholder="Name"
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="email"
            name="email"
            placeholder="Email (optional)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {pending ? "Adding..." : "Add contact"}
          </button>
          {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
