"use client";

import { useActionState } from "react";

type FormState = { error: string | null; success: string | null };
const initialState: FormState = { error: null, success: null };

/** Primary contact name/email/phone, notes, and account owner — all
 * already columns on clients, none editable anywhere before this (primary
 * contact name/email showed read-only on the Contacts tab, phone wasn't
 * shown at all). Read-only for anyone without manage_clients, same
 * gating as the rest of this page's edit controls. */
export function ClientDetailsForm({
  clientId,
  primaryContactName,
  primaryContactEmail,
  primaryContactPhone,
  address,
  notes,
  ownerId,
  ownerName,
  members,
  canEdit,
  saveAction,
}: {
  clientId: string;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  address: string | null;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  members: { id: string; full_name: string }[];
  canEdit: boolean;
  saveAction: (clientId: string, prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const boundAction = saveAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Client Details</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Detail label="Primary contact" value={primaryContactName} />
          <Detail label="Email" value={primaryContactEmail} />
          <Detail label="Phone" value={primaryContactPhone} />
          <Detail label="Account owner" value={ownerName} />
        </dl>
        {address && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Address</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{address}</p>
          </div>
        )}
        {notes && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Client Details</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">Primary Contact Name</label>
          <input
            name="primary_contact_name"
            defaultValue={primaryContactName ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Primary Contact Email</label>
          <input
            type="email"
            name="primary_contact_email"
            defaultValue={primaryContactEmail ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Primary Contact Phone</label>
          <input
            type="tel"
            name="primary_contact_phone"
            defaultValue={primaryContactPhone ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Account Owner</label>
          <select
            name="owner_id"
            defaultValue={ownerId ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
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
      <div>
        <label className="block text-xs font-medium text-slate-700">Address</label>
        <textarea
          name="address"
          rows={2}
          defaultValue={address ?? ""}
          placeholder="Synced from Autotask, or enter manually"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={notes ?? ""}
          placeholder="General reference notes about this client…"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-700">{value || "—"}</p>
    </div>
  );
}
