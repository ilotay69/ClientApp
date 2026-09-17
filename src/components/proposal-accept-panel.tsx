"use client";

import { useMemo, useState, useTransition } from "react";
import {
  computeProposalTotals,
  formatMoney,
  lineTotal,
  type ProposalLineItemInput,
} from "@/lib/proposal-totals";
import { SignaturePad } from "@/components/signature-pad";
import type { AcceptProposalResult } from "@/app/proposal-view/[token]/actions";

/** ProposalLineItemInput plus the invoice-facing wording and the reference
 * price, neither of which the totals module (proposal-totals.ts)
 * deliberately knows anything about — both are presentation, not
 * something any total is computed from. */
type AcceptPanelItem = ProposalLineItemInput & { detail: string | null; listPrice: number | null };

/** The struck-through "was" figure next to a line's real price, matching
 * the reference quote's Unit Price / Adjusted Unit Price columns — only
 * shown once a list price is actually set and differs from what's
 * charged. Compared at the extended (quantity × price) level so it's
 * never an apples-to-oranges unit-vs-line-total comparison. */
function listPriceLineTotal(item: AcceptPanelItem): number | null {
  if (item.listPrice === null || item.listPrice === item.unitPrice) return null;
  return lineTotal({ ...item, unitPrice: item.listPrice });
}

/** Fixed, not sourced from the closing_note field a rep writes — the same
 * wording CG's Autotask-generated quotes already carry on every one, word
 * for word. A rep can't forget to include it and can't accidentally
 * delete it, the same posture as the MSA link below it. */
const COLLECTIONS_NOTICE =
  "Interest Charges on Past Due Accounts and Collection Costs: overdue amounts shall be subject to a monthly finance charge. In addition, customer shall reimburse all costs and expenses for attorney's fees incurred in collecting any amounts past due. Additional training or Professional Services can be provided at our standard rates.";

const PERIOD_SECTIONS: { value: AcceptPanelItem["billingPeriod"]; label: string; suffix: string }[] = [
  { value: "one_off", label: "One-time", suffix: "" },
  { value: "annual", label: "Annually", suffix: "/yr" },
  { value: "monthly", label: "Monthly", suffix: "/mo" },
];

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
  companyName,
  currency,
  items,
  acceptAction,
}: {
  token: string;
  companyName: string;
  currency: string;
  items: AcceptPanelItem[];
  acceptAction: (
    token: string,
    input: {
      acceptedByName: string;
      acceptedByEmail: string;
      selectedOptionalItemIds: string[];
      authorityConfirmed: boolean;
      signatureDataUrl: string;
    }
  ) => Promise<AcceptProposalResult>;
}) {
  const optional = useMemo(() => items.filter((i) => i.isOptional), [items]);
  const included = useMemo(() => items.filter((i) => !i.isOptional), [items]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(optional.filter((i) => i.isSelected).map((i) => i.id))
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
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
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!authorityConfirmed) {
      setError("Please confirm you have authority to accept this proposal.");
      return;
    }
    if (!signatureDataUrl) {
      setError("Please sign above to accept.");
      return;
    }
    startTransition(async () => {
      const result = await acceptAction(token, {
        acceptedByName: name,
        acceptedByEmail: email,
        selectedOptionalItemIds: [...selected],
        authorityConfirmed,
        signatureDataUrl,
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
        <h2 className="text-xl font-semibold text-emerald-900">Thank you for accepting!</h2>
        <p className="mt-2 text-base text-emerald-800">
          Recorded {formatMoney(totals.firstInvoiceTotal, currency)} due at signing, including
          HST. Our Sales Team will be in touch with you shortly for next steps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-900">Your investment</h2>

        {PERIOD_SECTIONS.map((section) => {
          const periodItems = included.filter((i) => i.billingPeriod === section.value);
          if (periodItems.length === 0) return null;
          return (
            <div key={section.value} className="mt-5 first:mt-4">
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                {section.label}
              </p>
              <ul className="mt-2 space-y-2">
                {periodItems.map((item) => {
                  const wasTotal = listPriceLineTotal(item);
                  return (
                    <li key={item.id}>
                      <div className="flex items-baseline justify-between gap-4 text-base">
                        <span className="min-w-0 text-slate-700">
                          {item.description}
                          {item.quantity !== 1 && (
                            <span className="text-slate-400"> × {item.quantity}</span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-900">
                          {wasTotal !== null && (
                            <span className="mr-1.5 text-slate-400 line-through">
                              {formatMoney(wasTotal, currency)}
                            </span>
                          )}
                          {formatMoney(lineTotal(item), currency)}
                          <span className="text-sm text-slate-400">{section.suffix}</span>
                        </span>
                      </div>
                      {item.detail && <p className="mt-0.5 text-sm text-slate-500">{item.detail}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {optional.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Optional add-ons
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Tick anything you&apos;d like included. The total updates as you go.
            </p>
            <ul className="mt-3 space-y-2">
              {optional.map((item) => {
                const wasTotal = listPriceLineTotal(item);
                return (
                  <li key={item.id}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-slate-300">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base text-slate-700">{item.description}</span>
                        {item.detail && (
                          <span className="mt-0.5 block text-sm text-slate-500">{item.detail}</span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-900">
                        {wasTotal !== null && (
                          <span className="mr-1.5 text-slate-400 line-through">
                            {formatMoney(wasTotal, currency)}
                          </span>
                        )}
                        {formatMoney(lineTotal(item), currency)}
                        {item.billingPeriod === "monthly" && (
                          <span className="text-sm text-slate-400">/mo</span>
                        )}
                        {item.billingPeriod === "annual" && (
                          <span className="text-sm text-slate-400">/yr</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 space-y-1 border-t border-slate-200 pt-4 text-right">
          {totals.oneOffSubtotal > 0 && (
            <TotalLine label="One-time" value={formatMoney(totals.oneOffSubtotal, currency)} />
          )}
          {totals.annualSubtotal > 0 && (
            <TotalLine label="Annually" value={`${formatMoney(totals.annualSubtotal, currency)}/yr`} />
          )}
          {totals.monthlySubtotal > 0 && (
            <TotalLine label="Monthly" value={`${formatMoney(totals.monthlySubtotal, currency)}/mo`} />
          )}
          <TotalLine label={`HST (${(totals.taxRate * 100).toFixed(0)}%)`} value={formatMoney(totals.taxAmount, currency)} />
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
            {formatMoney(totals.firstInvoiceTotal, currency)}
          </p>
          <p className="text-sm text-slate-400">
            Due at signing, including HST.
            {totals.monthlySubtotal > 0 && " Monthly charges continue at that rate plus HST."}
          </p>
        </div>

        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
          {COLLECTIONS_NOTICE}
        </p>
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

        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={authorityConfirmed}
            onChange={(e) => setAuthorityConfirmed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
          />
          <span className="text-sm text-slate-600">
            I have the authority to accept this proposal on behalf of{" "}
            <strong>{companyName}</strong>.
          </span>
        </label>

        <div className="mt-4">
          <span className="mb-1 block text-sm font-medium text-slate-700">Signature</span>
          <SignaturePad onChange={setSignatureDataUrl} disabled={pending} />
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

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-base text-slate-600">
      {label}{" "}
      <span className="tabular-nums text-slate-900">{value}</span>
    </p>
  );
}
