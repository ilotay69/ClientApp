"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(dashboard)/settings/integrations/actions";

const initialState: FormState = { error: null, success: null };

export function M365PartnerSettingsForm({
  hasCredentials,
  isConnected,
  oboUserHint,
  connectedAt,
  currentPartnerTenantId,
  currentClientId,
  saveAction,
}: {
  hasCredentials: boolean;
  isConnected: boolean;
  oboUserHint: string | null;
  connectedAt: string | null;
  currentPartnerTenantId: string | null;
  currentClientId: string | null;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Microsoft 365 (Partner)</h2>
        <p className="mt-1 text-xs text-slate-500">
          {isConnected
            ? `Connected as ${oboUserHint}${connectedAt ? ` on ${new Date(connectedAt).toLocaleDateString()}` : ""}`
            : hasCredentials
              ? "Saved — not connected yet"
              : "Not set"}
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Partner tenant ID</label>
          <input
            name="partner_tenant_id"
            defaultValue={currentPartnerTenantId ?? ""}
            placeholder="Your own Microsoft 365 tenant's Directory (tenant) ID"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Client ID</label>
          <input
            name="client_id"
            defaultValue={currentClientId ?? ""}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Client secret</label>
          <input
            type="password"
            name="client_secret"
            placeholder={
              hasCredentials ? "Leave blank to keep the current secret" : "Paste the app registration's client secret"
            }
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save"}
          </button>
          {hasCredentials && (
            <a
              href="/api/m365-partner/connect"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {isConnected ? "Reconnect" : "Connect"}
            </a>
          )}
        </div>
      </form>

      <p className="mt-4 text-xs text-slate-500">
        Register a multitenant Azure AD app (redirect URI ending in
        /api/m365-partner/callback) with Graph delegated permissions
        LicenseAssignment.Read.All, SecurityEvents.Read.All, and
        DelegatedAdminRelationship.Read.All. Connecting requires an
        interactive sign-in (with MFA) by your OBO admin account — each
        client tenant also needs its own GDAP relationship with the Global
        Reader role and app consent, set up separately in Partner Center.
      </p>
    </div>
  );
}
