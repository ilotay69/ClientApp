"use client";

import { useMemo, useState, useTransition } from "react";
import type { AutotaskCatalogItem } from "@/lib/autotask";

type FormState = { error: string | null; success: string | null };

/** Picks the one Autotask Service/Product every "Push to Autotask" line
 * falls back to when a proposal line's description doesn't match an
 * existing catalog item by name — the API requires every QuoteItem to
 * reference something real, so there's always a fallback rather than a
 * failed push. Same search-the-catalog pattern as the proposal editor's
 * own "Add from Autotask" picker, just single-select and saved as a
 * setting instead of added to a proposal. */
export function AutotaskDefaultQuoteServiceForm({
  currentName,
  fetchAction,
  saveAction,
}: {
  currentName: string | null;
  fetchAction: () => Promise<{ items: AutotaskCatalogItem[] } | { error: string }>;
  saveAction: (serviceId: number, serviceName: string) => Promise<FormState>;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AutotaskCatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const openPicker = () => {
    setOpen(true);
    setSuccess(null);
    if (items !== null || loading) return;
    setError(null);
    startLoad(async () => {
      const result = await fetchAction();
      if ("error" in result) setError(result.error);
      else setItems(result.items);
    });
  };

  // Services only, never Products — the column this saves to
  // (autotask_settings.default_quote_service_id) is always read back as a
  // QuoteItem's serviceID specifically (see proposal-autotask-push.ts), so
  // a Product here would reference the wrong Autotask entity type
  // entirely and fail at push time.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? [])
      .filter((item) => item.kind === "service")
      .filter((item) => !q || item.name.toLowerCase().includes(q) || (item.description ?? "").toLowerCase().includes(q));
  }, [items, query]);

  const pick = (item: AutotaskCatalogItem) => {
    setError(null);
    startSave(async () => {
      const result = await saveAction(item.id, item.name);
      if (result.error) setError(result.error);
      else {
        setSuccess(result.success);
        setOpen(false);
      }
    });
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-sm font-medium text-slate-700">Default service for pushed proposal lines</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Every "Push to Autotask" line needs a real Autotask Service/Product to reference — this is
        the one used when a proposal line's wording doesn't match an existing service by name.
      </p>
      <p className="mt-2 text-sm text-slate-900">
        Currently: <span className="font-medium">{currentName ?? "Not set"}</span>
      </p>
      {success && <p className="mt-1 text-sm text-emerald-700">{success}</p>}

      {!open ? (
        <button
          type="button"
          onClick={openPicker}
          className="mt-2 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          {currentName ? "Change…" : "Choose…"}
        </button>
      ) : (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services and products…"
              className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 text-xs text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
          </div>

          {loading && <p className="mt-3 text-xs text-slate-500">Loading catalog from Autotask…</p>}
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

          {items && (
            <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white">
              {visible.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={saving}
                  onClick={() => pick(item)}
                  className="flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900">{item.name}</span>
                    {item.description && (
                      <span className="block truncate text-xs text-slate-500">{item.description}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs uppercase text-slate-400">{item.kind}</span>
                </button>
              ))}
              {visible.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-slate-500">Nothing matches that search.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
