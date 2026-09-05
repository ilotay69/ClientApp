"use client";

import { AutotaskContactPicker } from "@/components/autotask-contact-picker";
import { DeleteButton } from "@/components/delete-button";
import type { FormState } from "@/app/(dashboard)/clients/actions";

/** Contacts only ever come from Autotask now (no manual add) — the first
 * one in the list doubles as the "primary contact" shown up top, since
 * neither Autotask's Contacts entity nor this app's own client_contacts
 * table has a real "primary" flag to pull instead. */
export function ClientContactsPanel({
  contacts,
  canManageClients,
  removeAction,
  hasAutotaskMapping,
  searchAutotaskAction,
  addFromAutotaskAction,
}: {
  contacts: { id: string; name: string; email: string | null }[];
  canManageClients: boolean;
  removeAction: (contactId: string) => Promise<void>;
  hasAutotaskMapping: boolean;
  searchAutotaskAction: () => Promise<
    { contacts: { id: number; name: string; email: string | null }[] } | { error: string }
  >;
  addFromAutotaskAction: (contacts: { name: string; email: string | null }[]) => Promise<FormState>;
}) {
  const primary = contacts[0] ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Contacts</h2>

      {primary && (
        <div className="mb-4 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Primary contact
          </p>
          <p className="text-sm font-medium text-slate-900">{primary.name}</p>
          {primary.email && <p className="text-xs text-slate-500">{primary.email}</p>}
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-500">No contacts yet.</p>
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

      {canManageClients && hasAutotaskMapping && (
        <div className="mt-4">
          <AutotaskContactPicker searchAction={searchAutotaskAction} addAction={addFromAutotaskAction} />
        </div>
      )}
    </div>
  );
}
