"use client";

import { useMemo, useState, useTransition } from "react";
import { formatMoney } from "@/lib/proposal-totals";
import type { AutotaskCatalogItem } from "@/lib/autotask";
import type { CatalogSelection, ProposalActionState } from "@/app/(dashboard)/proposals/actions";

/** Pick services and products straight out of Autotask instead of retyping
 * them.
 *
 * The catalog is loaded when the picker is opened, not with the page —
 * it's two live Autotask queries and most edits never need it.
 *
 * Quarterly and semi-annual services come in as one-off with their real
 * period shown here and carried into the line's detail — a proposal line
 * is only ever one-off, annual, or monthly, and quietly relabelling
 * $300/quarter as $300/month would put a wrong number in front of a
 * client. A genuinely yearly service maps straight to "annual" instead.
 * Showing the odd periods lets the rep decide. */
export function ProposalCatalogPicker({
  proposalId,
  currency,
  fetchAction,
  addAction,
}: {
  proposalId: string;
  currency: string;
  fetchAction: () => Promise<{ items: AutotaskCatalogItem[] } | { error: string }>;
  addAction: (proposalId: string, selections: CatalogSelection[]) => Promise<ProposalActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AutotaskCatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "service" | "product">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, startLoad] = useTransition();
  const [adding, startAdd] = useTransition();

  const openPicker = () => {
    setOpen(true);
    if (items !== null || loading) return;
    setError(null);
    startLoad(async () => {
      const result = await fetchAction();
      if ("error" in result) setError(result.error);
      else setItems(result.items);
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, kind]);

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const add = () => {
    const chosen = (items ?? []).filter((i) => picked.has(i.key));
    if (chosen.length === 0) return;
    startAdd(async () => {
      const result = await addAction(
        proposalId,
        chosen.map((item) => ({
          name: item.name,
          // The period travels with the line so it survives into the
          // document itself, not just this picker.
          detail:
            item.periodLabel && item.billingPeriod === "one_off"
              ? [item.description, `Billed ${item.periodLabel.toLowerCase()}`]
                  .filter(Boolean)
                  .join(" — ")
              : item.description,
          unitPrice: item.unitPrice,
          billingPeriod: item.billingPeriod,
        }))
      );
      if (result.ok) {
        setPicked(new Set());
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPicker}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        Add from Autotask
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Autotask services &amp; products
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Close
        </button>
      </div>

      {loading && <p className="mt-3 text-xs text-slate-500">Loading catalog from Autotask…</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {items && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services and products…"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none sm:w-64"
            />
            <div className="flex gap-1">
              {(
                [
                  { value: "all", label: "All" },
                  { value: "service", label: "Services" },
                  { value: "product", label: "Products" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    kind === option.value
                      ? "bg-brand text-white"
                      : "border border-slate-300 text-slate-600 hover:bg-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-slate-200 bg-white">
            {visible.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={picked.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900">{item.name}</span>
                  {item.description && (
                    <span className="block truncate text-xs text-slate-500">{item.description}</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm tabular-nums text-slate-900">
                    {formatMoney(item.unitPrice, currency)}
                    {item.billingPeriod === "monthly" && (
                      <span className="text-xs text-slate-400">/mo</span>
                    )}
                    {item.billingPeriod === "annual" && (
                      <span className="text-xs text-slate-400">/yr</span>
                    )}
                  </span>
                  {item.periodLabel && item.billingPeriod === "one_off" && (
                    <span className="block text-xs text-amber-700">
                      billed {item.periodLabel.toLowerCase()}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {visible.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-slate-500">
                Nothing matches that search.
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={add}
              disabled={adding || picked.size === 0}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {adding ? "Adding…" : `Add ${picked.size || ""} selected`.trim()}
            </button>
            <span className="text-xs text-slate-400">
              Prices come from Autotask — you can edit any of them after adding.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
