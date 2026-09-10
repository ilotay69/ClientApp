"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearMustChangePassword } from "@/app/portal/reset-password/actions";

const MIN_LENGTH = 8;

/**
 * Reached whenever must_change_password is set — a brand-new portal login,
 * or one staff just reset (see sendPortalPasswordReset, which emails a temp
 * password directly rather than a Supabase magic link). Just an ordinary
 * supabase.auth.updateUser({ password }) call, followed by clearing the
 * flag so getPortalContext lets them through next time.
 */
export function PortalResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    await clearMustChangePassword();

    // Reaching this form at all means MFA is already satisfied (see
    // getPortalContext — must_change_password is only checked after AAL2,
    // since Supabase refuses a password update before that anyway), so
    // /portal is always the right next stop, new login or reset alike.
    router.replace("/portal");
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Set your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Choose a password for your CG Technologies client portal login.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
