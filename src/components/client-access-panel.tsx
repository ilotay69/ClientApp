"use client";

import { useActionState, useState, useTransition } from "react";
import type {
  PortalUserRow,
  CreatePortalUserState,
} from "@/app/(dashboard)/team/client-access/actions";
import { formatDate } from "@/lib/format";

const initialState: CreatePortalUserState = {
  error: null,
  createdPassword: null,
  createdEmail: null,
};

export function ClientAccessPanel({
  portalUsers,
  clients,
  createAction,
  resetPasswordAction,
  resetMfaAction,
  removeAction,
}: {
  portalUsers: PortalUserRow[];
  clients: { id: string; name: string }[];
  createAction: (
    prev: CreatePortalUserState,
    formData: FormData
  ) => Promise<CreatePortalUserState>;
  resetPasswordAction: (userId: string) => Promise<{ error?: string; sent?: boolean }>;
  resetMfaAction: (userId: string) => Promise<{ error?: string; reset?: boolean }>;
  removeAction: (userId: string) => Promise<{ error?: string; removed?: boolean }>;
}) {
  const [state, formAction, pending] = useActionState(createAction, initialState);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Create a portal login</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Read-only access to that client&apos;s own contract hours, devices, licences and
            security posture. They cannot see anything else, and cannot change anything.
          </p>
        </div>

        <form action={formAction} className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Full name</label>
            <input
              type="text"
              name="full_name"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Client</label>
            <select
              name="client_id"
              required
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="" disabled>
                Choose a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create portal login"}
            </button>
          </div>
        </form>

        {state.createdPassword && (
          <div className="mx-5 mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-medium text-amber-900">
              Login created for {state.createdEmail}
            </p>
            <p className="mt-1 text-amber-900">
              Temporary password:{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono">
                {state.createdPassword}
              </code>
            </p>
            <p className="mt-2 text-xs text-amber-800">
              Shown once — it isn&apos;t stored anywhere retrievable. They&apos;ll be asked to
              set up an authenticator app the first time they sign in.{" "}
              <strong>
                Safer alternative: use &ldquo;Email password reset&rdquo; below instead of
                sending this password
              </strong>{" "}
              — whoever signs in first is the one who enrols the authenticator, so a password
              that leaks in a chat message can lock the real client out.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Portal logins ({portalUsers.length})
          </h2>
        </div>

        {portalUsers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No client portal logins yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Person</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Client</th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">
                    Authenticator
                  </th>
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Last sign-in</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {portalUsers.map((u) => (
                  <PortalUserRowView
                    key={u.id}
                    user={u}
                    resetPasswordAction={resetPasswordAction}
                    resetMfaAction={resetMfaAction}
                    removeAction={removeAction}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PortalUserRowView({
  user,
  resetPasswordAction,
  resetMfaAction,
  removeAction,
}: {
  user: PortalUserRow;
  resetPasswordAction: (userId: string) => Promise<{ error?: string; sent?: boolean }>;
  resetMfaAction: (userId: string) => Promise<{ error?: string; reset?: boolean }>;
  removeAction: (userId: string) => Promise<{ error?: string; removed?: boolean }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(
    fn: () => Promise<{ error?: string }>,
    successMessage: string,
    confirmText?: string
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else setNotice(successMessage);
    });
  }

  return (
    <tr>
      <td className="px-5 py-2">
        <p className="font-medium text-slate-900">{user.fullName}</p>
        <p className="text-xs text-slate-500">{user.email}</p>
        {notice && <p className="mt-1 text-xs text-emerald-600">{notice}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-5 py-2 text-slate-600">{user.clientName}</td>
      <td className="px-5 py-2">
        {user.mfaEnrolled ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Set up
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            Not yet
          </span>
        )}
      </td>
      <td className="px-5 py-2 text-slate-600">
        {user.lastSignInAt ? formatDate(user.lastSignInAt) : "Never"}
      </td>
      <td className="px-5 py-2">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(() => resetPasswordAction(user.id), "Reset email sent.")
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Email password reset
          </button>
          <button
            type="button"
            disabled={isPending || !user.mfaEnrolled}
            onClick={() =>
              run(
                () => resetMfaAction(user.id),
                "Authenticator cleared — they'll set up a new one at next sign-in.",
                `Clear ${user.fullName}'s authenticator? Only do this if you've confirmed who is asking — they'll be able to set up a new one on their next sign-in.`
              )
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Reset authenticator
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () => removeAction(user.id),
                "Login removed.",
                `Permanently remove ${user.fullName}'s portal login (${user.email})? They will lose access immediately.`
              )
            }
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
