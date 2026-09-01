"use client";

import { useActionState } from "react";
import type { Client } from "@/lib/types";
import type { FormState } from "@/app/(dashboard)/clients/actions";

const initialState: FormState = { error: null };

export function ClientForm({
  client,
  action,
  submitLabel,
}: {
  client?: Client;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <Field label="Client name" name="name" defaultValue={client?.name} required />
      <Field
        label="Primary contact name"
        name="primary_contact_name"
        defaultValue={client?.primary_contact_name ?? ""}
      />
      <Field
        label="Primary contact email"
        name="primary_contact_email"
        type="email"
        defaultValue={client?.primary_contact_email ?? ""}
      />
      <Field
        label="Primary contact phone"
        name="primary_contact_phone"
        defaultValue={client?.primary_contact_phone ?? ""}
      />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </div>
  );
}
