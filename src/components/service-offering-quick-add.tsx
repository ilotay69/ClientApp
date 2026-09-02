"use client";

import { useActionState, useRef } from "react";

type FormState = { error: string | null };
const initialState: FormState = { error: null };

export function ServiceOfferingQuickAdd({
  action,
}: {
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
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4"
    >
      <input
        name="name"
        placeholder="Service name"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <input
        name="description"
        placeholder="Description (optional)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      {state.error && <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60 sm:w-fit"
      >
        {pending ? "Adding..." : "Add service"}
      </button>
    </form>
  );
}
