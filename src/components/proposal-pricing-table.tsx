"use client";

import { useTransition } from "react";
import { InlineTextEdit, InlineSelectEdit } from "@/components/task-field-editor";
import { DeleteButton } from "@/components/delete-button";
import {
  computeProposalTotals,
  formatMoney,
  lineTotal,
  type ProposalLineItemInput,
} from "@/lib/proposal-totals";
import type { ProposalLineItem } from "@/lib/proposal-data";
import { ProposalCatalogPicker } from "@/components/proposal-catalog-picker";
import type { AutotaskCatalogItem } from "@/lib/autotask";
import type { CatalogSelection, ProposalActionState } from "@/app/(dashboard)/proposals/actions";

const BILLING_OPTIONS = [
  { value: "one_off", label: "One-off" },
  { value: "monthly", label: "Monthly" },
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
  disabled,
  addAction,
  updateAction,
  deleteAction,
  fetchCatalogAction,
  addFromCatalogAction,
}: {
  proposalId: string;
  items: ProposalLineItem[];
  currency: string;
  disabled?: boolean;
  addAction: (proposalId: string) => Promise<void>;
  updateAction: (itemId: string, field: string, value: string) => Promise<void>;
  deleteAction: (itemId: string) => Promise<void>;
  fetchCatalogAction: () => Promise<{ items: AutotaskCatalogItem[] } | { error: string }>;
  addFromCatalogAction: (
    proposalId: string,
    selections: CatalogSelection[]
  ) => Promise<ProposalActionState>;
}) {
  const [adding, startAdd] = useTransition();

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
            <Row label="One-off" value={formatMoney(totals.oneOffSubtotal, currency)} />
          )}
          {totals.monthlySubtotal > 0 && (
            <Row label="Monthly" value={`${formatMoney(totals.monthlySubtotal, currency)}/mo`} />
          )}
          {(totals.optionalOneOffAvailable > 0 || totals.optionalMonthlyAvailable > 0) && (
            <p className="text-xs text-slate-500">
              Optional add-ons (if selected) +
              {totals.optionalOneOffAvailable > 0 &&
                ` ${formatMoney(totals.optionalOneOffAvailable, currency)}`}
              {totals.optionalMonthlyAvailable > 0 &&
                ` ${formatMoney(totals.optionalMonthlyAvailable, currency)}/mo`}
            </p>
          )}
          <p className="text-lg font-semibold text-slate-900">
            {formatMoney(totals.firstInvoiceTotal, currency)}
          </p>
          <p className="text-xs text-slate-400">First invoice, before applicable taxes.</p>
        </div>
      )}
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
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
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
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
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
