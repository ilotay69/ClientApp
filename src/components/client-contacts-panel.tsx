"use client";

import { AutotaskContactPicker } from "@/components/autotask-contact-picker";
import { DeleteButton } from "@/components/delete-button";
import type { FormState } from "@/app/(dashboard)/clients/actions";

/** Primary contact is a real Autotask designation (its Contacts entity
 * enforces at most one primaryContact per company) — synced in
 * automatically whenever this client's Autotask data syncs, never
 * editable or removable here. The rest of the list is manually curated
 * (Autotask contacts added on demand) and can be removed. */
export function ClientContactsPanel({
  primaryContactName,
  primaryContactEmail,
  contacts,
  canManageClients,
  removeAction,
  hasAutotaskMapping,
  searchAutotaskAction,
  addFromAutotaskAction,
}: {
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  contacts: { id: string; name: string; email: string | null }[];
  canManageClients: boolean;
  removeAction: (contactId: string) => Promise<void>;
  hasAutotaskMapping: boolean;
  searchAutotaskAction: () => Promise<
    { contacts: { id: number; name: string; email: string | null }[] } | { error: string }
  >;
  addFromAutotaskAction: (contacts: { name: string; email: string | null }[]) => Promise<FormState>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Contacts</h2>

      <div className="mb-4 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Primary contact
        </p>
        {primaryContactName ? (
          <>
            <p className="text-sm font-medium text-slate-900">{primaryContactName}</p>
            {primaryContactEmail && (
              <p className="text-xs text-slate-500">{primaryContactEmail}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">
            {hasAutotaskMapping
              ? "None set in Autotask yet."
              : "Not linked to Autotask yet."}
          </p>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-500">No other contacts yet.</p>
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
