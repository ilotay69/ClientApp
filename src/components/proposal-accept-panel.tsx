"use client";

import { useMemo, useState, useTransition } from "react";
import {
  computeProposalTotals,
  formatMoney,
  lineTotal,
  type ProposalLineItemInput,
} from "@/lib/proposal-totals";
import type { AcceptProposalResult } from "@/app/proposal-view/[token]/actions";

/** The pricing summary, the optional add-ons, and the accept button — the
 * only interactive part of the prospect's page.
 *
 * Ticking an add-on updates the total instantly from the same
 * computeProposalTotals the server uses, with no round trip: a spinner
 * between "I want backup too" and seeing what it costs is exactly where
 * someone stops and decides to "think about it".
 *
 * What gets written on acceptance is always recomputed server-side from the
 * database rows — this is presentation, not the record. */
export function ProposalAcceptPanel({
  token,
  currency,
  items,
  acceptAction,
}: {
  token: string;
  currency: string;
  items: ProposalLineItemInput[];
  acceptAction: (
    token: string,
    input: { acceptedByName: string; acceptedByEmail: string; selectedOptionalItemIds: string[] }
  ) => Promise<AcceptProposalResult>;
}) {
  const optional = useMemo(() => items.filter((i) => i.isOptional), [items]);
  const included = useMemo(() => items.filter((i) => !i.isOptional), [items]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(optional.filter((i) => i.isSelected).map((i) => i.id))
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();

  const totals = useMemo(
    () => computeProposalTotals(items.map((i) => ({ ...i, isSelected: selected.has(i.id) }))),
    [items, selected]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await acceptAction(token, {
        acceptedByName: name,
        acceptedByEmail: email,
        selectedOptionalItemIds: [...selected],
      });
      if (result.ok) setAccepted(true);
      else setError(result.message);
    });
  };

  // Swapped in place rather than navigating: the document they just agreed
  // to stays on screen behind the confirmation, which is what someone wants
  // to be able to scroll back through immediately after saying yes.
  if (accepted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-900">Accepted — thank you</h2>
        <p className="mt-2 text-base text-emerald-800">
          Recorded {formatMoney(totals.firstInvoiceTotal, currency)} on your first invoice, before
          applicable taxes. Your CG contact has been notified and will be in touch to get things
          started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-900">Your investment</h2>

        <ul className="mt-4 space-y-2">
          {included.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4 text-base">
              <span className="min-w-0 text-slate-700">
                {item.description}
                {item.quantity !== 1 && <span className="text-slate-400"> × {item.quantity}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-slate-900">
                {formatMoney(lineTotal(item), currency)}
                {item.billingPeriod === "monthly" && (
                  <span className="text-sm text-slate-400">/mo</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {optional.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Optional add-ons
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Tick anything you&apos;d like included. The total updates as you go.
            </p>
            <ul className="mt-3 space-y-2">
              {optional.map((item) => (
                <li key={item.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 hover:border-slate-300">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      className="h-5 w-5 shrink-0 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1 text-base text-slate-700">
                      {item.description}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-900">
                      {formatMoney(lineTotal(item), currency)}
                      {item.billingPeriod === "monthly" && (
                        <span className="text-sm text-slate-400">/mo</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 border-t border-slate-200 pt-4 text-right">
          {totals.oneOffSubtotal > 0 && (
            <p className="text-base text-slate-600">
              One-off{" "}
              <span className="tabular-nums text-slate-900">
                {formatMoney(totals.oneOffSubtotal, currency)}
              </span>
            </p>
          )}
          {totals.monthlySubtotal > 0 && (
            <p className="text-base text-slate-600">
              Monthly{" "}
              <span className="tabular-nums text-slate-900">
                {formatMoney(totals.monthlySubtotal, currency)}
              </span>
            </p>
          )}
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
            {formatMoney(totals.firstInvoiceTotal, currency)}
          </p>
          <p className="text-sm text-slate-400">First invoice, before applicable taxes.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-900">Accept this proposal</h2>
        <p className="mt-2 text-base text-slate-600">
          Confirming here tells us to go ahead. We&apos;ll follow up to schedule the work.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Your email <span className="text-slate-400">(optional)</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand focus:outline-none"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-4 w-full rounded-lg bg-brand px-8 py-4 text-base font-medium text-white hover:bg-brand-dark disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Recording…" : `Accept — ${formatMoney(totals.firstInvoiceTotal, currency)}`}
        </button>
      </div>
    </div>
  );
}
