"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AutotaskCompany } from "@/lib/autotask";

// Loads every active Autotask company not already added here, up front —
// no need to search and add one at a time. A text box narrows the list
// client-side (it's already loaded), and a checklist lets several be
// picked and created in one action.
export function AutotaskClientSearch({
  listAction,
  createManyAction,
}: {
  listAction: () => Promise<{ companies: AutotaskCompany[] } | { error: string }>;
  createManyAction: (
    companies: AutotaskCompany[]
  ) => Promise<{ created: number; errors: string[] }>;
}) {
  const router = useRouter();
  const [companies, setCompanies] = useState<AutotaskCompany[] | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [creating, startCreate] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const result = await listAction();
      if ("error" in result) setError(result.error);
      else setCompanies(result.companies);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    if (!companies) return [];
    const q = filter.trim().toLowerCase();
    return q ? companies.filter((c) => c.companyName.toLowerCase().includes(q)) : companies;
  }, [companies, filter]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const allVisibleSelected = visible.every((c) => prev.has(c.id));
      const next = new Set(prev);
      for (const c of visible) {
        if (allVisibleSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  };

  const createSelected = () => {
    if (!companies) return;
    const picked = companies.filter((c) => selected.has(c.id));
    if (picked.length === 0) return;

    setError(null);
    startCreate(async () => {
      const result = await createManyAction(picked);
      if (result.errors.length > 0) {
        setError(result.errors.join("; "));
      }
      if (result.created > 0) {
        router.push("/clients");
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Add from Autotask</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every active Autotask company not already added here. Check as many as you need and add
        them all at once.
      </p>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name…"
        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      {loading && <p className="mt-3 text-sm text-slate-500">Loading active companies…</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {companies && (
        <>
          {companies.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Nothing to add — every active Autotask company is already here.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className="text-xs text-slate-500 hover:underline"
                >
                  {visible.every((c) => selected.has(c.id)) ? "Deselect all" : "Select all"}
                  {filter.trim() ? " (filtered)" : ""}
                </button>
                <span className="text-xs text-slate-500">{selected.size} selected</span>
              </div>
              <ul className="mt-2 max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-100">
                {visible.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="shrink-0"
                      />
                      <span className="text-sm text-slate-900">{c.companyName}</span>
                    </label>
                  </li>
                ))}
                {visible.length === 0 && (
                  <li className="px-3 py-2 text-sm text-slate-500">No matches.</li>
                )}
              </ul>
              <button
                type="button"
                onClick={createSelected}
                disabled={creating || selected.size === 0}
                className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {creating ? "Adding…" : `Add selected (${selected.size})`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
