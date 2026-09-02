"use client";

import { useActionState, useState, useTransition } from "react";
import type { M365FormState } from "@/app/(dashboard)/clients/actions";

const initialState: M365FormState = { error: null, success: null };

export function M365ClientCredentialsButton({
  tenantId,
  hasCredentials,
  currentAppClientId,
  saveAction,
  testAction,
  unlinkAction,
}: {
  tenantId: string | null;
  hasCredentials: boolean;
  currentAppClientId: string | null;
  saveAction: (prevState: M365FormState, formData: FormData) => Promise<M365FormState>;
  testAction: () => Promise<{ ok: boolean; message: string }>;
  unlinkAction: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, startTest] = useTransition();
  const [unlinking, startUnlink] = useTransition();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        {tenantId !== null ? "Change M365 credentials" : "Link to M365"}
      </button>

      {expanded && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="text-sm text-slate-500">
            Enter this client&apos;s own Microsoft 365 app registration — created and consented by
            their admin, in their own tenant.
          </p>
          <form action={formAction} className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Tenant ID</label>
              <input
                name="tenant_id"
                defaultValue={tenantId ?? ""}
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">App Client ID</label>
              <input
                name="app_client_id"
                defaultValue={currentAppClientId ?? ""}
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">App Client Secret</label>
              <input
                type="password"
                name="app_client_secret"
                placeholder={hasCredentials ? "Leave blank to keep the current secret" : "Paste the app's client secret"}
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
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
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
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
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
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => setExpanded(false)} className="text-xs text-slate-500 hover:underline">
              Close
            </button>
            {tenantId !== null && (
              <button
                type="button"
                disabled={unlinking}
                onClick={() =>
                  startUnlink(async () => {
                    await unlinkAction();
                    setExpanded(false);
                  })
                }
                className="text-xs text-red-600 hover:underline disabled:opacity-60"
              >
                Remove mapping
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
