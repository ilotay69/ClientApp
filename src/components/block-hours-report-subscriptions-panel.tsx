"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ClientCombobox } from "@/components/client-combobox";
import { formatDateTime } from "@/lib/format";

type FormState = { error: string | null; success: string | null };
const initialFormState: FormState = { error: null, success: null };

export type BlockHoursReportSubscription = {
  id: string;
  clientId: string;
  clientName: string;
  toEmail: string;
};

export type BlockHoursReportLogEntry = {
  id: string;
  sentAt: string;
  clientName: string;
  toEmail: string;
  ccEmail: string | null;
  error: string | null;
};

export function BlockHoursReportSubscriptionsPanel({
  subscriptions,
  clients,
  currentCcEmail,
  addAction,
  removeAction,
  saveCcAction,
  sendNowAction,
  log,
}: {
  subscriptions: BlockHoursReportSubscription[];
  clients: { id: string; name: string; email?: string | null }[];
  currentCcEmail: string | null;
  addAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (id: string) => Promise<{ error: string | null }>;
  saveCcAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  sendNowAction: () => Promise<{
    error: string | null;
    sent: number;
    errors: { clientName: string; message: string }[];
  }>;
  log: BlockHoursReportLogEntry[];
}) {
  const [ccState, ccFormAction, savingCc] = useActionState(saveCcAction, initialFormState);

  const [addState, addFormAction, adding] = useActionState(addAction, initialFormState);
  const [clientId, setClientId] = useState("");
  const [toEmail, setToEmail] = useState("");
  const addFormRef = useRef<HTMLFormElement>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();

  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    message: string;
    errors: { clientName: string; message: string }[];
  } | null>(null);
  const [sending, startSend] = useTransition();

  const selectClient = (id: string) => {
    setClientId(id);
    setToEmail(clients.find((c) => c.id === id)?.email ?? "");
  };

  const remove = (id: string) => {
    setRemovingId(id);
    startRemove(async () => {
      const result = await removeAction(id);
      if (result.error) window.alert(result.error);
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

      <form
        action={ccFormAction}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div>
          <label className="block text-xs font-medium text-slate-700">CC every send to</label>
          <input
            type="text"
            name="cc_email"
            defaultValue={currentCcEmail ?? ""}
            placeholder="e.g. accounts@cgtechnologies.com"
            className="mt-1 w-72 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            One address (or a comma-separated list) CC'd on every report this list sends —
            manual sends included.
          </p>
        </div>
        <button
          type="submit"
          disabled={savingCc}
          className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {savingCc ? "Saving…" : "Save"}
        </button>
        {ccState.error && <p className="w-full text-sm text-red-600">{ccState.error}</p>}
        {ccState.success && <p className="w-full text-sm text-emerald-700">{ccState.success}</p>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Send to</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 text-slate-900">{s.clientName}</td>
                <td className="px-4 py-2 text-slate-700">{s.toEmail}</td>
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
                <td colSpan={3} className="px-4 py-4 text-center text-slate-500">
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
            setToEmail("");
          }}
          className="flex flex-wrap items-end gap-3 border-t border-slate-200 px-4 py-3"
        >
          <input type="hidden" name="client_id" value={clientId} />
          <div className="w-56">
            <label className="block text-xs font-medium text-slate-700">Client</label>
            <ClientCombobox clients={clients} value={clientId} onChange={selectClient} className="mt-1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Send to</label>
            <input
              type="email"
              name="to_email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              required
              placeholder="client@example.com"
              className="mt-1 w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
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

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2">
          <h3 className="text-sm font-semibold text-slate-900">Send log</h3>
          <p className="text-xs text-slate-500">Every attempt, automated or manual — most recent first.</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Date</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Sent to</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">CC</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {log.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{formatDateTime(entry.sentAt)}</td>
                  <td className="px-4 py-2 text-slate-900">{entry.clientName}</td>
                  <td className="px-4 py-2 text-slate-700">{entry.toEmail}</td>
                  <td className="px-4 py-2 text-slate-700">{entry.ccEmail ?? "—"}</td>
                  <td className={`px-4 py-2 ${entry.error ? "text-red-600" : "text-emerald-700"}`}>
                    {entry.error ?? "Sent"}
                  </td>
                </tr>
              ))}
              {log.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-500">
                    Nothing sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
