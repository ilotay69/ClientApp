"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ClientCombobox } from "@/components/client-combobox";
import type { BlockHoursCandidate } from "@/app/(dashboard)/settings/integrations/actions";

type FormState = { error: string | null; success: string | null };
const initialFormState: FormState = { error: null, success: null };

export type BlockHoursReportSubscription = {
  id: string;
  clientId: string;
  clientName: string;
  toEmail: string;
};

export function BlockHoursReportSubscriptionsPanel({
  subscriptions,
  clients,
  currentCcEmail,
  addAction,
  removeAction,
  saveCcAction,
  sendNowAction,
  sendToSelectedAction,
  fetchCandidatesAction,
  addManyAction,
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
  sendToSelectedAction: (subscriptionIds: string[]) => Promise<{
    error: string | null;
    sent: number;
    errors: { clientName: string; message: string }[];
  }>;
  fetchCandidatesAction: () => Promise<{ rows: BlockHoursCandidate[] } | { error: string }>;
  addManyAction: (entries: { clientId: string; toEmail: string }[]) => Promise<{
    error: string | null;
    added: number;
  }>;
}) {
  const [ccState, ccFormAction, savingCc] = useActionState(saveCcAction, initialFormState);

  const [addState, addFormAction, adding] = useActionState(addAction, initialFormState);
  const [clientId, setClientId] = useState("");
  const [toEmail, setToEmail] = useState("");
  const addFormRef = useRef<HTMLFormElement>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    message: string;
    errors: { clientName: string; message: string }[];
  } | null>(null);
  const [sending, startSend] = useTransition();
  const [sendingSelected, startSendSelected] = useTransition();

  // The "Get from Autotask" picker: null until it's been fetched at least
  // once, so the panel below can tell "not opened yet" from "opened and
  // there's genuinely nothing to add".
  const [candidates, setCandidates] = useState<BlockHoursCandidate[] | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [pickedClientIds, setPickedClientIds] = useState<Set<string>>(new Set());
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [loadingCandidates, startLoadCandidates] = useTransition();
  const [addingMany, startAddMany] = useTransition();

  const addableCandidates = (candidates ?? []).filter((c) => c.toEmail);

  const loadCandidates = () => {
    setCandidateError(null);
    setAddedMessage(null);
    startLoadCandidates(async () => {
      const result = await fetchCandidatesAction();
      if ("error" in result) {
        setCandidateError(result.error);
        setCandidates([]);
      } else {
        setCandidates(result.rows);
        // Pre-tick everything that can actually be added — the common case
        // is "add them all", and un-ticking a couple is less work than
        // ticking twenty.
        setPickedClientIds(new Set(result.rows.filter((r) => r.toEmail).map((r) => r.clientId)));
      }
    });
  };

  const togglePicked = (clientId: string) => {
    setPickedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const addPicked = () => {
    const entries = (candidates ?? [])
      .filter((c) => c.toEmail && pickedClientIds.has(c.clientId))
      .map((c) => ({ clientId: c.clientId, toEmail: c.toEmail as string }));
    setAddedMessage(null);
    startAddMany(async () => {
      const result = await addManyAction(entries);
      if (result.error) {
        setCandidateError(result.error);
      } else {
        setAddedMessage(`Added ${result.added} client${result.added === 1 ? "" : "s"}.`);
        setCandidates(null);
        setPickedClientIds(new Set());
      }
    });
  };

  const selectClient = (id: string) => {
    setClientId(id);
    setToEmail(clients.find((c) => c.id === id)?.email ?? "");
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === subscriptions.length ? new Set() : new Set(subscriptions.map((s) => s.id))));
  };

  const remove = (id: string) => {
    setRemovingId(id);
    startRemove(async () => {
      const result = await removeAction(id);
      if (result.error) window.alert(result.error);
      else setSelectedIds((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : prev));
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

  const sendToSelected = () => {
    setSendResult(null);
    startSendSelected(async () => {
      const result = await sendToSelectedAction([...selectedIds]);
      if (result.error) {
        setSendResult({ ok: false, message: result.error, errors: [] });
      } else {
        setSendResult({
          ok: true,
          message: `Sent ${result.sent} of ${selectedIds.size} selected.`,
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
            className="mt-1 w-full sm:w-72 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
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

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Only the table scrolls horizontally on a narrow screen — the
            add-form below is a sibling, not nested in here, so its
            ClientCombobox dropdown isn't clipped by this div's own
            overflow (an ancestor with overflow-x set also computes
            overflow-y as clipping, not just visible-and-ignored). */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-8 px-4 py-2">
                <input
                  type="checkbox"
                  checked={subscriptions.length > 0 && selectedIds.size === subscriptions.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
              <th className="px-4 py-2 text-left font-medium text-slate-500">Send to</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    aria-label={`Select ${s.clientName}`}
                  />
                </td>
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
                <td colSpan={4} className="px-4 py-4 text-center text-slate-500">
                  No clients on this list yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

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
              type="text"
              name="to_email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              required
              placeholder="client@example.com, another@example.com"
              className="mt-1 w-full sm:w-72 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">Separate multiple addresses with a comma or semicolon.</p>
          </div>
          <button
            type="submit"
            disabled={adding || !clientId}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add"}
          </button>
          {/* type="button" — inside the add form, but it opens the bulk
              picker rather than submitting a single client. */}
          <button
            type="button"
            onClick={loadCandidates}
            disabled={loadingCandidates}
            className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {loadingCandidates ? "Checking Autotask…" : "Get from Autotask"}
          </button>
          {addState.error && <p className="w-full text-sm text-red-600">{addState.error}</p>}
          {addedMessage && <p className="w-full text-sm text-emerald-700">{addedMessage}</p>}
          {candidateError && <p className="w-full text-sm text-red-600">{candidateError}</p>}
        </form>

        {candidates !== null && candidates.length > 0 && (
          <div className="border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2">
              <p className="text-xs text-slate-600">
                {candidates.length} client{candidates.length === 1 ? "" : "s"} with an active block of
                hours in Autotask, not already on this list.
              </p>
              <button
                type="button"
                onClick={addPicked}
                disabled={addingMany || pickedClientIds.size === 0}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {addingMany ? "Adding…" : `Add selected (${pickedClientIds.size})`}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {candidates.map((c) => (
                <label
                  key={c.clientId}
                  className={`flex items-start justify-between gap-3 px-4 py-2 text-sm ${
                    c.toEmail ? "cursor-pointer hover:bg-slate-50" : "opacity-60"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!c.toEmail}
                      checked={pickedClientIds.has(c.clientId)}
                      onChange={() => togglePicked(c.clientId)}
                    />
                    <span>
                      <span className="font-medium text-slate-900">{c.clientName}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="text-slate-600">{c.contractName}</span>
                      <span className="block text-xs text-slate-500">
                        {c.toEmail ?? "No primary contact email on file — add this one by hand."}
                      </span>
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {c.remaining.toFixed(1)} of {c.purchased.toFixed(1)} hrs left
                  </span>
                </label>
              ))}
            </div>
            {addableCandidates.length < candidates.length && (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                {candidates.length - addableCandidates.length} can&apos;t be added here — no primary
                contact email on file. Set one on the client, or add them above with an address typed
                in.
              </p>
            )}
          </div>
        )}

        {candidates !== null && candidates.length === 0 && !candidateError && (
          <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Every client with an active block of hours in Autotask is already on this list.
          </p>
        )}
      </div>

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={sendToSelected}
          disabled={sendingSelected || selectedIds.size === 0}
          className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {sendingSelected ? "Sending…" : `Send to selected (${selectedIds.size})`}
        </button>
        <button
          type="button"
          onClick={sendNow}
          disabled={sending || subscriptions.length === 0}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send to all clients"}
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

      <Link
        href="/settings/integrations/block-hours-log"
        className="inline-block text-sm font-medium text-brand underline"
      >
        View send log →
      </Link>
    </div>
  );
}
