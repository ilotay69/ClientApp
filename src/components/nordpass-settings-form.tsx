"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(dashboard)/settings/integrations/actions";

const initialState: FormState = { error: null, success: null };

export function NordPassSettingsForm({
  hasCredentials,
  saveAction,
}: {
  hasCredentials: boolean;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">NordPass Business</h2>
        <p className="mt-1 text-xs text-slate-500">
          {hasCredentials ? "Private key saved" : "Not set"}
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Provider API private key</label>
          <textarea
            name="private_key"
            rows={4}
            placeholder={hasCredentials ? "Leave blank to keep the current key" : "Paste the private key"}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
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

      <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        This just stores the key for now — there&apos;s no &quot;Test connection&quot; yet.
        NordPass&apos;s public docs only cover generating this key (MSP Admin Panel → Integrations
        → Provider API → Generate Private Key); the actual request format for calling the Provider
        API isn&apos;t published anywhere public. Once we get that spec — from NordPass support, or
        whatever&apos;s shown alongside the key in the admin panel — the real client and lookups
        (license usage, organization status) can be built.
      </p>
    </div>
  );
}
