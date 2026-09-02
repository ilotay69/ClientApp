"use client";

import { useActionState, useRef } from "react";

type FormState = { error: string | null };
const initialState: FormState = { error: null };

export function ClientServiceQuickAdd({
  available,
  action,
}: {
  available: { id: string; name: string }[];
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
      className="border-t border-slate-200 px-5 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="service_id"
          required
          defaultValue=""
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            Add a service…
          </option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Adding..." : "Add"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
