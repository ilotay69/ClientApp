"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/app/(dashboard)/settings/integrations/actions";

const initialState: FormState = { error: null, success: null };

export function AutotaskSettingsForm({
  hasCredentials,
  zoneUrl,
  currentUsername,
  currentIntegrationCode,
  saveAction,
  testAction,
}: {
  hasCredentials: boolean;
  zoneUrl: string | null;
  currentUsername: string | null;
  currentIntegrationCode: string | null;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  testAction: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, startTest] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Autotask</h2>
          <p className="mt-1 text-xs text-slate-500">
            {hasCredentials ? "Credentials configured" : "Not set"}
            {zoneUrl ? ` · zone resolved` : ""}
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Username</label>
          <input
            name="username"
            defaultValue={currentUsername ?? ""}
            placeholder="api-user@yourcompany.com"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Secret</label>
          <input
            type="password"
            name="secret"
            placeholder={hasCredentials ? "Leave blank to keep the current secret" : "Paste the API user's secret"}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Integration code</label>
          <input
            name="integration_code"
            defaultValue={currentIntegrationCode ?? ""}
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
        Per-client ticket visibility is configured from each client&apos;s Tickets tab.
      </p>
    </div>
  );
}
