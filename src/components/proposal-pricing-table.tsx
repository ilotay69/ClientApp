"use client";

import { useEffect, useState, useTransition } from "react";
import { InlineTextEdit, InlineSelectEdit } from "@/components/task-field-editor";
import { DeleteButton } from "@/components/delete-button";
import {
  computeProposalTotals,
  formatMoney,
  lineTotal,
  DEFAULT_PAYMENT_TERMS,
  type ProposalLineItemInput,
} from "@/lib/proposal-totals";
import type { ProposalLineItem } from "@/lib/proposal-data";
import { ProposalCatalogPicker } from "@/components/proposal-catalog-picker";
import type { AutotaskCatalogItem } from "@/lib/autotask";
import type { CatalogSelection, ProposalActionState } from "@/app/(dashboard)/proposals/actions";

const BILLING_OPTIONS = [
  { value: "one_off", label: "One-time" },
  { value: "annual", label: "Annually" },
  { value: "monthly", label: "Monthly" },
];

/** Display order for the three billing-period subgroups within a
 * Required/Optional group — one-time work first (what gets done), then the
 * annual and monthly commitments that follow from it. */
const PERIOD_SECTIONS: { value: ProposalLineItem["billingPeriod"]; label: string; suffix: string }[] = [
  { value: "one_off", label: "One-time", suffix: "" },
  { value: "annual", label: "Annually", suffix: "/yr" },
  { value: "monthly", label: "Monthly", suffix: "/mo" },
];

/** The priced part of a proposal.
 *
 * InlineTextEdit/InlineSelectEdit are reused exactly as they are — their
 * `taskId` prop is an opaque string handed straight back to
 * action(id, field, value), so a line item id drops in without touching
 * that file (two other features depend on it; renaming the prop for
 * tidiness would be a gratuitous risk).
 *
 * Below `sm` every row becomes a stacked, labelled card. A five-column grid
 * at 375px is unusable, and the alternative — hiding columns — would hide
 * the price. */
export function ProposalPricingTable({
  proposalId,
  items,
  currency,
  paymentTerms,
  disabled,
  addAction,
  updateAction,
  deleteAction,
  fetchCatalogAction,
  addFromCatalogAction,
  updateFieldAction,
}: {
  proposalId: string;
  items: ProposalLineItem[];
  currency: string;
  /** Null means "use DEFAULT_PAYMENT_TERMS" — see migration 143. */
  paymentTerms: string | null;
  disabled?: boolean;
  addAction: (proposalId: string) => Promise<void>;
  updateAction: (itemId: string, field: string, value: string) => Promise<void>;
  deleteAction: (itemId: string) => Promise<void>;
  fetchCatalogAction: () => Promise<{ items: AutotaskCatalogItem[] } | { error: string }>;
  addFromCatalogAction: (
    proposalId: string,
    selections: CatalogSelection[]
  ) => Promise<ProposalActionState>;
  updateFieldAction: (proposalId: string, field: string, value: string) => Promise<void>;
}) {
  const [adding, startAdd] = useTransition();
  const [termsDraft, setTermsDraft] = useState(paymentTerms ?? "");
  const [savingTerms, startSaveTerms] = useTransition();

  // Re-syncs if the stored value changes underneath this same component
  // instance (e.g. Revise resetting the proposal) - useState's initializer
  // only ever runs once at mount otherwise.
  useEffect(() => {
    setTermsDraft(paymentTerms ?? "");
  }, [paymentTerms]);

  const saveTerms = () => {
    if (termsDraft === (paymentTerms ?? "")) return;
    startSaveTerms(() => updateFieldAction(proposalId, "payment_terms", termsDraft));
  };

  const totalsInput: ProposalLineItemInput[] = items.map((i) => ({
    id: i.id,
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    billingPeriod: i.billingPeriod,
    isOptional: i.isOptional,
    isSelected: i.isSelected,
  }));
  const totals = computeProposalTotals(totalsInput);

  const included = items.filter((i) => !i.isOptional);
  const optional = items.filter((i) => i.isOptional);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Pricing</h2>
        {!disabled && (
          <div className="flex flex-wrap items-center gap-2">
            <ProposalCatalogPicker
              proposalId={proposalId}
              currency={currency}
              fetchAction={fetchCatalogAction}
              addAction={addFromCatalogAction}
            />
            <button
              type="button"
              disabled={adding}
              onClick={() => startAdd(() => void addAction(proposalId))}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add blank line"}
            </button>
          </div>
        )}
      </div>

      <Group title={null} items={included} currency={currency} disabled={disabled} updateAction={updateAction} deleteAction={deleteAction} />

      {optional.length > 0 && (
        <Group
          title="Optional add-ons"
          subtitle="The prospect ticks these themselves. They're excluded from the total below until they do."
          items={optional}
          currency={currency}
          disabled={disabled}
          updateAction={updateAction}
          deleteAction={deleteAction}
        />
      )}

      {items.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          No line items yet. A proposal needs at least one before it can be sent.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-right">
          {totals.oneOffSubtotal > 0 && (
            <Row label="One-time" value={formatMoney(totals.oneOffSubtotal, currency)} />
          )}
          {totals.annualSubtotal > 0 && (
            <Row label="Annually" value={`${formatMoney(totals.annualSubtotal, currency)}/yr`} />
          )}
          {totals.monthlySubtotal > 0 && (
            <Row label="Monthly" value={`${formatMoney(totals.monthlySubtotal, currency)}/mo`} />
          )}
          {(totals.optionalOneOffAvailable > 0 ||
            totals.optionalAnnualAvailable > 0 ||
            totals.optionalMonthlyAvailable > 0) && (
            <p className="text-xs text-slate-500">
              Optional add-ons (if selected) +
              {totals.optionalOneOffAvailable > 0 &&
                ` ${formatMoney(totals.optionalOneOffAvailable, currency)}`}
              {totals.optionalAnnualAvailable > 0 &&
                ` ${formatMoney(totals.optionalAnnualAvailable, currency)}/yr`}
              {totals.optionalMonthlyAvailable > 0 &&
                ` ${formatMoney(totals.optionalMonthlyAvailable, currency)}/mo`}
            </p>
          )}
          <Row label={`HST (${(totals.taxRate * 100).toFixed(0)}%)`} value={formatMoney(totals.taxAmount, currency)} />
          <p className="text-lg font-semibold text-slate-900">
            {formatMoney(totals.firstInvoiceTotal, currency)}
          </p>
        </div>
      )}

      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment terms</p>
        {disabled ? (
          <p className="mt-1 whitespace-pre-line text-right text-xs text-slate-400">
            {paymentTerms || DEFAULT_PAYMENT_TERMS}
          </p>
        ) : (
          <>
            <textarea
              value={termsDraft}
              rows={2}
              disabled={savingTerms}
              onChange={(e) => setTermsDraft(e.target.value)}
              onBlur={saveTerms}
              placeholder={DEFAULT_PAYMENT_TERMS}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 focus:border-brand focus:outline-none disabled:opacity-60"
            />
            <p className="mt-0.5 text-xs text-slate-400">
              {savingTerms ? "Saving…" : "Leave blank to use the default shown as the placeholder."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-slate-600">
      <span className="mr-2 text-slate-400">{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}

function Group({
  title,
  subtitle,
  items,
  currency,
  disabled,
  updateAction,
  deleteAction,
}: {
  title: string | null;
  subtitle?: string;
  items: ProposalLineItem[];
  currency: string;
  disabled?: boolean;
  updateAction: (itemId: string, field: string, value: string) => Promise<void>;
  deleteAction: (itemId: string) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      {title && (
        <div className="mb-1 border-t border-dashed border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
      )}
      {/* One-time / Annually / Monthly, each its own list — a rep pricing a
          migration project (one-time) alongside ongoing support (monthly)
          shouldn't have to read down a single mixed list to tell which is
          which. Empty periods render nothing. */}
      {PERIOD_SECTIONS.map((section) => {
        const periodItems = items.filter((i) => i.billingPeriod === section.value);
        if (periodItems.length === 0) return null;
        return (
          <div key={section.value} className="mt-2 first:mt-0">
            <p className="text-xs font-medium text-slate-400">{section.label}</p>
            <div className="divide-y divide-slate-100">
              {periodItems.map((item) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  currency={currency}
                  disabled={disabled}
                  updateAction={updateAction}
                  deleteAction={deleteAction}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineItemRow({
  item,
  currency,
  disabled,
  updateAction,
  deleteAction,
}: {
  item: ProposalLineItem;
  currency: string;
  disabled?: boolean;
  updateAction: (itemId: string, field: string, value: string) => Promise<void>;
  deleteAction: (itemId: string) => Promise<void>;
}) {
  const [togglePending, startToggle] = useTransition();

  return (
    <div className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1 text-sm text-slate-900">
        <FieldLabel>Description</FieldLabel>
        <InlineTextEdit
          taskId={item.id}
          field="description"
          value={item.description}
          disabled={disabled}
          action={updateAction}
        />
      </div>

      <div className="w-full sm:w-16">
        <FieldLabel>Qty</FieldLabel>
        <InlineTextEdit
          taskId={item.id}
          field="quantity"
          value={String(item.quantity)}
          disabled={disabled}
          action={updateAction}
        />
      </div>

      {(item.listPrice !== null || !disabled) && (
        <div className="w-full sm:w-24">
          <FieldLabel>List price</FieldLabel>
          <InlineTextEdit
            taskId={item.id}
            field="list_price"
            value={item.listPrice !== null ? String(item.listPrice) : ""}
            disabled={disabled}
            placeholder="Optional"
            emptyLabel="—"
            action={updateAction}
          />
        </div>
      )}

      <div className="w-full sm:w-28">
        <FieldLabel>Unit price</FieldLabel>
        <InlineTextEdit
          taskId={item.id}
          field="unit_price"
          value={String(item.unitPrice)}
          disabled={disabled}
          action={updateAction}
        />
      </div>

      <div className="w-full sm:w-28">
        <FieldLabel>Billing</FieldLabel>
        <InlineSelectEdit
          taskId={item.id}
          field="billing_period"
          value={item.billingPeriod}
          disabled={disabled}
          action={updateAction}
          options={BILLING_OPTIONS}
        />
      </div>

      <div className="w-full text-sm font-medium tabular-nums text-slate-900 sm:w-24 sm:text-right">
        <FieldLabel>Total</FieldLabel>
        {item.listPrice !== null && item.listPrice !== item.unitPrice && (
          <span className="mr-1 text-xs text-slate-400 line-through">
            {formatMoney(
              lineTotal({
                id: item.id,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.listPrice,
                billingPeriod: item.billingPeriod,
                isOptional: item.isOptional,
                isSelected: item.isSelected,
              }),
              currency
            )}
          </span>
        )}
        {formatMoney(
          lineTotal({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            billingPeriod: item.billingPeriod,
            isOptional: item.isOptional,
            isSelected: item.isSelected,
          }),
          currency
        )}
        {item.billingPeriod === "monthly" && <span className="text-xs text-slate-400">/mo</span>}
        {item.billingPeriod === "annual" && <span className="text-xs text-slate-400">/yr</span>}
      </div>

      {!disabled && (
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex min-h-11 items-center gap-1.5 text-xs text-slate-600 sm:min-h-0">
            <input
              type="checkbox"
              checked={item.isOptional}
              disabled={togglePending}
              onChange={(e) =>
                startToggle(() => void updateAction(item.id, "is_optional", String(e.target.checked)))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            Optional
          </label>
          <DeleteButton
            action={() => deleteAction(item.id)}
            confirmText={`Remove "${item.description}"?`}
            label="Remove"
          />
        </div>
      )}
      </div>

      {/* The invoice-facing wording for this line — pulled in automatically
          when the item comes from "Add from Autotask" (Services carry a
          proper invoiceDescription; billed-quarterly/etc. items get their
          real period appended here too, since a proposal line only has
          one-off/monthly). Editable like everything else, and left blank
          for a hand-typed line unless the rep wants to add one. */}
      {(item.detail || !disabled) && (
        <div className="mt-1.5 text-xs text-slate-500">
          <InlineTextEdit
            taskId={item.id}
            field="detail"
            value={item.detail ?? ""}
            disabled={disabled}
            placeholder="Invoice description (optional)"
            emptyLabel="Add an invoice description"
            action={updateAction}
          />
        </div>
      )}
    </div>
  );
}

/** Only visible on a phone, where the row is a stacked card and each field
 * needs saying. On `sm` and up the column layout makes them redundant. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 sm:hidden">
      {children}
    </span>
  );
}
