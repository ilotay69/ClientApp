"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/app/(dashboard)/settings/integrations/actions";

const initialState: FormState = { error: null, success: null };

const REGIONS = [
  { value: "cloud.gravityzone.bitdefender.com", label: "Non-EU (cloud.gravityzone.bitdefender.com)" },
  { value: "cloudgz.gravityzone.bitdefender.com", label: "EU (cloudgz.gravityzone.bitdefender.com)" },
];

export function BitdefenderSettingsForm({
  hasCredentials,
  currentRegion,
  saveAction,
  testAction,
}: {
  hasCredentials: boolean;
  currentRegion: string | null;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  testAction: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, startTest] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Bitdefender GravityZone</h2>
        <p className="mt-1 text-xs text-slate-500">
          {hasCredentials ? "Credentials configured" : "Not set"}
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Region</label>
          <select
            name="region"
            defaultValue={currentRegion ?? "cloud.gravityzone.bitdefender.com"}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Match the domain your GravityZone console logs into.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">API key</label>
          <input
            type="password"
            name="api_key"
            placeholder={hasCredentials ? "Leave blank to keep the current key" : "Paste the API key"}
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
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save"}
          </button>
          {hasCredentials && (
            <button
              type="button"
              disabled={testing}
              onClick={() =>
                startTest(async () => {
                  setTestResult(await testAction());
                })
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {testing ? "Testing..." : "Test connection"}
            </button>
          )}
        </div>
        {testResult && (
          <p className={`text-sm ${testResult.ok ? "text-emerald-700" : "text-red-600"}`}>
            {testResult.message}
          </p>
        )}
      </form>

      <p className="mt-4 text-xs text-slate-500">
        Generate a key under My Account → API keys in your GravityZone console, granting it the
        Companies and Network APIs. Requires the Partners product tier — a Cloud Solutions-only
        account will connect but return no companies. This just confirms the connection for now;
        a per-client company mapping and lookups (endpoint status, malware status) are a
        follow-up, not wired up yet.
      </p>
    </div>
  );
}
