"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ClientCombobox } from "@/components/client-combobox";

type FormState = { error: string | null; success: string | null };
const initialAddState: FormState = { error: null, success: null };

export type BlockHoursReportSubscription = {
  id: string;
  clientId: string;
  clientName: string;
  toEmail: string;
  ccEmail: string | null;
};

export function BlockHoursReportSubscriptionsPanel({
  subscriptions,
  clients,
  addAction,
  removeAction,
  sendNowAction,
}: {
  subscriptions: BlockHoursReportSubscription[];
  clients: { id: string; name: string; email?: string | null }[];
  addAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (id: string) => Promise<{ error: string | null }>;
  sendNowAction: () => Promise<{
    error: string | null;
    sent: number;
    errors: { clientName: string; message: string }[];
  }>;
}) {
  const [addState, addFormAction, adding] = useActionState(addAction, initialAddState);
  const [clientId, setClientId] = useState("");
  const addFormRef = useRef<HTMLFormElement>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();

  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    message: string;
    errors: { clientName: string; message: string }[];
  } | null>(null);
  const [sending, startSend] = useTransition();

  const remove = (id: string) => {
    setRemovingId(id);
    startRemove(async () => {
      const result = await removeAction(id);
      if (result.error) {
        // Surfaced inline via a plain alert-style message isn't ideal, but
        // this is a rare failure path (a DB error) — good enough to not
        // fail silently.
        window.alert(result.error);
      }
      setRemovingId(null);
    });
  };

  const sendNow = () => {
    setSendResult(null);
    startSend(async () => {
      const result = await sendNowAction();
      if (result.error) {
        setSendResult({ ok: false, message: result.error, errors: [] });
      } else {
        setSendResult({
          ok: true,
          message: `Sent ${result.sent} of ${subscriptions.length}.`,
          errors: result.errors,
        });
      }
    });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Block of Hours Usage Report</h2>
        <p className="mt-1 text-xs text-slate-500">
          Clients on this list get their prepaid block hours usage report emailed automatically
          — set up a Railway cron trigger against{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">/api/block-hours-report-send</code> at
          whatever cadence you want it sent (e.g. monthly). Uses the Block of Hours Usage Report
          template under Email Templates.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Send to</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">CC</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 text-slate-900">{s.clientName}</td>
                <td className="px-4 py-2 text-slate-700">{s.toEmail}</td>
                <td className="px-4 py-2 text-slate-700">{s.ccEmail ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    disabled={removePending && removingId === s.id}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                  >
                    {removePending && removingId === s.id ? "Removing…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
            {subscriptions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-slate-500">
                  No clients on this list yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <form
          ref={addFormRef}
          action={async (formData: FormData) => {
            await addFormAction(formData);
            // Always reset, success or not — a failed add still shows its
            // error via addState below, and re-typing over stale text is
            // more annoying than just starting fresh either way.
            addFormRef.current?.reset();
            setClientId("");
          }}
          className="flex flex-wrap items-end gap-3 border-t border-slate-200 px-4 py-3"
        >
          <input type="hidden" name="client_id" value={clientId} />
          <div className="w-56">
            <label className="block text-xs font-medium text-slate-700">Client</label>
            <ClientCombobox clients={clients} value={clientId} onChange={setClientId} className="mt-1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Send to</label>
            <input
              type="email"
              name="to_email"
              required
              placeholder="client@example.com"
              className="mt-1 w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">CC (optional)</label>
            <input
              type="text"
              name="cc_email"
              placeholder="one@example.com, two@example.com"
              className="mt-1 w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !clientId}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add"}
          </button>
          {addState.error && <p className="w-full text-sm text-red-600">{addState.error}</p>}
        </form>
      </div>

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={sendNow}
          disabled={sending || subscriptions.length === 0}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send now (test)"}
        </button>
        {sendResult && (
          <div className={`text-sm ${sendResult.ok ? "text-emerald-700" : "text-red-600"}`}>
            <p>{sendResult.message}</p>
            {sendResult.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-red-600">
                {sendResult.errors.map((e, i) => (
                  <li key={i}>
                    {e.clientName}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
