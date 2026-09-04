"use client";

import { useActionState, useRef } from "react";
import type { FormState } from "@/app/(dashboard)/sales-requests/actions";

const initialState: FormState = { error: null };

export function SalesRequestQuickAdd({
  clients,
  action,
  defaultClientId = "",
}: {
  clients: { id: string; name: string }[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  defaultClientId?: string;
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
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="title"
          placeholder="What's being requested?"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:flex-1"
        />
        <select
          name="client_id"
          defaultValue={defaultClientId}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-56"
        >
          <option value="">No client (internal)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <textarea
        name="detail"
        placeholder="Detail (optional)..."
        rows={2}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

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
