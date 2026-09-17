"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(dashboard)/settings/integrations/actions";

const initialState: FormState = { error: null, success: null };

/** CG's own name/address - the "from" side shown on client-facing
 * documents (currently just proposals). Kept as a settings form rather
 * than hardcoded so it never needs a code change if the office moves. */
export function CompanyInfoForm({
  currentCompanyName,
  currentAddress,
  saveAction,
}: {
  currentCompanyName: string;
  currentAddress: string | null;
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Company Info</h2>
        <p className="mt-1 text-xs text-slate-500">
          Shown as the &quot;from&quot; side on proposals - the public page a client reads and
          the signed PDF they receive after accepting.
        </p>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Company Name</label>
          <input
            type="text"
            name="company_name"
            defaultValue={currentCompanyName}
            required
            className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Address</label>
          <textarea
            name="address"
            defaultValue={currentAddress ?? ""}
            rows={3}
            placeholder="123 Example St, Suite 100&#10;City, Province  Postal Code"
            className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
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
    </div>
  );
}
