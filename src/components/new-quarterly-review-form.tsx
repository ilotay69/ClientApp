"use client";

import { useState, useTransition } from "react";

/** clientId is pre-selected when arriving with ?client_id= already in the
 * URL, but this is a standalone create form either way — it doesn't
 * require a client to already be "selected" elsewhere on the page. */
export function NewQuarterlyReviewForm({
  clients,
  defaultClientId,
  action,
}: {
  clients: { id: string; name: string }[];
  defaultClientId: string | null;
  action: (clientId: string, reviewPeriod: string) => Promise<void>;
}) {
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [period, setPeriod] = useState("");
  const [pending, startTransition] = useTransition();

  function run() {
    if (!clientId || !period.trim()) return;
    startTransition(() => action(clientId, period.trim()));
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs font-medium text-slate-700">Client</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Review period</label>
        <input
          type="text"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="e.g. April 2026"
          className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={run}
        disabled={pending || !clientId || !period.trim()}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Starting…" : "Start review"}
      </button>
    </div>
  );
}
