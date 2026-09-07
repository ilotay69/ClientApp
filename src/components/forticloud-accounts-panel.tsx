"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type {
  ForticloudAccountSummary,
  FormState,
} from "@/app/(dashboard)/settings/integrations/forticloud-actions";

const initialState: FormState = { error: null, success: null };

/** FortiCloud is modeled as a repeatable list of independent accounts —
 * mostly CG-owned shared ones, plus a few clients' own — rather than one
 * singleton settings row like every other integration, so this panel is
 * shaped differently: a list with per-row test/delete, plus an add form,
 * instead of a single credentials form. */
export function ForticloudAccountsPanel({
  listAction,
  addAction,
  deleteAction,
  testAction,
}: {
  listAction: () => Promise<{ accounts: ForticloudAccountSummary[] } | { error: string }>;
  addAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  deleteAction: (accountId: string) => Promise<void>;
  testAction: (accountId: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [accounts, setAccounts] = useState<ForticloudAccountSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startAction] = useTransition();

  const reload = () => {
    listAction().then((res) => {
      if ("error" in res) setListError(res.error);
      else {
        setListError(null);
        setAccounts(res.accounts);
      }
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [addState, addFormAction, addPending] = useActionState(addAction, initialState);
  const addFormRef = useRef<HTMLFormElement>(null);
  const prevAddState = useRef(addState);
  useEffect(() => {
    if (prevAddState.current !== addState && !addState.error) {
      addFormRef.current?.reset();
      reload();
    }
    prevAddState.current = addState;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addState]);

  const runTest = (accountId: string) => {
    setPendingId(accountId);
    startAction(async () => {
      const result = await testAction(accountId);
      setTestResults((prev) => ({ ...prev, [accountId]: result }));
      setPendingId(null);
    });
  };

  const runDelete = (accountId: string, label: string) => {
    if (!window.confirm(`Remove the FortiCloud account "${label}"? Any client linked to it will be unlinked.`)) {
      return;
    }
    setPendingId(accountId);
    startAction(async () => {
      await deleteAction(accountId);
      setPendingId(null);
      reload();
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">FortiCloud</h2>
        <p className="mt-1 text-xs text-slate-500">
          Mostly CG-owned shared accounts, plus any client that has their own FortiCloud account —
          add each one separately below.
        </p>
      </div>

      {listError && <p className="mt-3 text-sm text-red-600">{listError}</p>}

      {accounts && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Label</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">API user</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-slate-900">{a.label}</td>
                  <td className="px-3 py-2 text-slate-600">{a.apiUser}</td>
                  <td className="px-3 py-2">
                    {testResults[a.id] && (
                      <span className={testResults[a.id].ok ? "text-emerald-700" : "text-red-600"}>
                        {testResults[a.id].message}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={pendingId === a.id}
                        onClick={() => runTest(a.id)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        {pendingId === a.id ? "Working…" : "Test"}
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === a.id}
                        onClick={() => runDelete(a.id, a.label)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                    No FortiCloud accounts added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <form ref={addFormRef} action={addFormAction} className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-slate-700">Label</label>
          <input
            name="label"
            placeholder="e.g. CG Account 1"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-slate-700">API user</label>
          <input name="api_user" autoComplete="off" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-slate-700">API password</label>
          <input
            type="password"
            name="api_password"
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end sm:col-span-1">
          <button
            type="submit"
            disabled={addPending}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {addPending ? "Adding…" : "Add account"}
          </button>
        </div>
        {addState.error && <p className="text-sm text-red-600 sm:col-span-4">{addState.error}</p>}
        {addState.success && <p className="text-sm text-emerald-700 sm:col-span-4">{addState.success}</p>}
      </form>

      <p className="mt-4 text-xs text-slate-500">
        Create an IAM API user under Identity &amp; Access Management in the FortiCloud portal and
        download its credentials (API user, password). This just confirms the connection for now —
        assigning a client to one of these accounts and lookups (asset/license status) are a
        follow-up, not wired up yet.
      </p>
    </div>
  );
}
