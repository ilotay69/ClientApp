"use client";

import { useActionState } from "react";
import type { AiProvider } from "@/lib/ai";
import type { FormState } from "@/app/(dashboard)/settings/ai/actions";

const initialState: FormState = { error: null, success: null };

export function AiProviderSettingsForm({
  provider,
  label,
  defaultModel,
  hasKey,
  isActive,
  currentModel,
  saveAction,
  activateAction,
}: {
  provider: AiProvider;
  label: string;
  defaultModel: string;
  hasKey: boolean;
  isActive: boolean;
  currentModel: string | null;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  activateAction: (provider: AiProvider) => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {hasKey ? "Key configured" : "Not set"}
          </p>
        </div>
        {isActive ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            Active
          </span>
        ) : (
          <form action={activateAction.bind(null, provider)}>
            <button
              type="submit"
              disabled={!hasKey}
              title={hasKey ? undefined : "Add an API key before activating"}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              Make active
            </button>
          </form>
        )}
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">API key</label>
          <input
            type="password"
            name="api_key"
            placeholder={hasKey ? "Leave blank to keep the current key" : "Paste your API key"}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Model (optional)</label>
          <input
            name="model"
            defaultValue={currentModel ?? ""}
            placeholder={defaultModel}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
