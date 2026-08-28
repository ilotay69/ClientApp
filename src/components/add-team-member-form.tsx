"use client";

import { useActionState, useRef, useState } from "react";
import type { AddMemberState } from "@/app/(dashboard)/team/actions";
import type { UserRole } from "@/lib/types";

const initialState: AddMemberState = { error: null, createdPassword: null };

const ROLES: UserRole[] = ["director", "manager", "tech"];

export function AddTeamMemberForm({
  action,
}: {
  action: (prevState: AddMemberState, formData: FormData) => Promise<AddMemberState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [lastEmail, setLastEmail] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        setLastEmail(String(formData.get("email") ?? ""));
        formAction(formData);
        formRef.current?.reset();
      }}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4"
    >
      <input
        name="full_name"
        placeholder="Full name"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        type="email"
        name="email"
        placeholder="Email"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <select
        name="role"
        defaultValue="tech"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace("_", " ")}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add team member"}
      </button>

      {state.error && (
        <p className="sm:col-span-4 text-sm text-red-600">{state.error}</p>
      )}
      {state.createdPassword && (
        <p className="sm:col-span-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Account created{lastEmail ? ` for ${lastEmail}` : ""}. Temporary
          password (share this with them directly — it won&apos;t be shown
          again):{" "}
          <span className="font-mono font-semibold">{state.createdPassword}</span>
        </p>
      )}
    </form>
  );
}
