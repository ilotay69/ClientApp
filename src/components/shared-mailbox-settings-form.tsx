"use client";

import { useState, useTransition } from "react";
import { IndeterminateProgressBar } from "@/components/progress-bar";
import { formatDate } from "@/lib/format";

type ActionResult = { ok: boolean; message: string };

/** No "connect" button, deliberately — this integration uses app-only
 * (client-credentials) Graph auth, not a per-user OAuth login. There's
 * nothing to paste or click through here beyond confirming it's actually
 * working; the real setup (Application permissions + admin consent + an
 * Exchange Application Access Policy scoping this app to just this mailbox)
 * happens in Azure/Exchange, outside this app entirely. */
export function SharedMailboxSettingsForm({
  mailboxEmail,
  lastSyncedAt,
  lastSyncError,
  lastSyncErrorAt,
  testAction,
  syncAction,
}: {
  mailboxEmail: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastSyncErrorAt: string | null;
  testAction: () => Promise<ActionResult>;
  syncAction: () => Promise<ActionResult>;
}) {
  const [testResult, setTestResult] = useState<ActionResult | null>(null);
  const [testing, startTest] = useTransition();
  const [syncResult, setSyncResult] = useState<ActionResult | null>(null);
  const [syncing, startSync] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Shared mailbox</h2>
        <p className="mt-1 text-xs text-slate-500">
          {mailboxEmail
            ? `${mailboxEmail} — used for interview invites and candidate messaging`
            : "Not configured — set the SHARED_MAILBOX_EMAIL environment variable"}
        </p>
      </div>

      {lastSyncError && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          <p className="font-medium">Last sync failed{lastSyncErrorAt ? ` (${formatDate(lastSyncErrorAt)})` : ""}</p>
          <p className="mt-0.5">{lastSyncError}</p>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Last synced: {lastSyncedAt ? formatDate(lastSyncedAt) : "Never"}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          disabled={syncing}
          onClick={() =>
            startSync(async () => {
              setSyncResult(await syncAction());
            })
          }
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        {(testing || syncing) && <IndeterminateProgressBar />}
      </div>
      {testResult && (
        <p className={`mt-2 text-sm ${testResult.ok ? "text-emerald-700" : "text-red-600"}`}>
          {testResult.message}
        </p>
      )}
      {syncResult && (
        <p className={`mt-1 text-sm ${syncResult.ok ? "text-emerald-700" : "text-red-600"}`}>
          {syncResult.message}
        </p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Uses app-only Microsoft Graph access (Application permissions,
        restricted to this one mailbox via an Exchange Application Access
        Policy) rather than a per-user login — no reconnect needed as tokens
        expire, and safe to poll on a schedule.
      </p>
    </div>
  );
}
