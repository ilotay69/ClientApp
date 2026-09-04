"use client";

import { useState, useTransition } from "react";

type PickableContact = { id: number; name: string; email: string | null };

export function AutotaskContactPicker({
  searchAction,
  addAction,
}: {
  searchAction: () => Promise<{ contacts: PickableContact[] } | { error: string }>;
  addAction: (contacts: { name: string; email: string | null }[]) => Promise<{ error: string | null }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [contacts, setContacts] = useState<PickableContact[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [adding, startAdd] = useTransition();

  const open = () => {
    setExpanded(true);
    setError(null);
    startLoad(async () => {
      const result = await searchAction();
      if ("error" in result) {
        setError(result.error);
        setContacts(null);
      } else {
        setContacts(result.contacts);
        setSelected(new Set());
      }
    });
  };

  const close = () => {
    setExpanded(false);
    setContacts(null);
    setSelected(new Set());
    setError(null);
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addSelected = () => {
    if (!contacts) return;
    const picked = contacts
      .filter((c) => selected.has(c.id))
      .map((c) => ({ name: c.name, email: c.email }));
    if (picked.length === 0) return;

    startAdd(async () => {
      const result = await addAction(picked);
      if (result.error) {
        setError(result.error);
      } else {
        close();
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (expanded ? close() : open())}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        Add from Autotask
      </button>

      {expanded && (
        <div className="absolute left-0 z-20 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="text-sm text-slate-500">
            Contacts from this client&apos;s Autotask company that aren&apos;t already added here.
          </p>

          {loading && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          {contacts && (
            <>
              {contacts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Nothing new to add — every active Autotask contact is already here.
                </p>
              ) : (
                <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-100">
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          className="shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-900">{c.name}</span>
                          {c.email && (
                            <span className="block truncate text-xs text-slate-500">{c.email}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={close} className="text-xs text-slate-500 hover:underline">
              Close
            </button>
            {contacts && contacts.length > 0 && (
              <button
                type="button"
                onClick={addSelected}
                disabled={adding || selected.size === 0}
                className="ml-auto rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {adding ? "Adding…" : `Add selected (${selected.size})`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
