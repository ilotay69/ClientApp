/** The one place proposal money is added up.
 *
 * Four separate surfaces show a proposal's total — the staff editor, the
 * prospect's public page, the email, and the PDF — and a proposal where two
 * of them disagree is worse than one with no totals at all. So they all
 * import from here rather than each summing the rows themselves.
 *
 * Deliberately dependency-free and free of any Supabase/React import: the
 * prospect page runs this in the browser on every checkbox tick, and the
 * cron route runs it on the server. */

export type ProposalBillingPeriod = "one_off" | "annual" | "monthly";

/** Shown under Pricing in the staff editor, the public page, the PDF, and
 * the acceptance email whenever a proposal hasn't set its own
 * payment_terms (migration 143) — editable per proposal, this is just the
 * starting text. */
export const DEFAULT_PAYMENT_TERMS =
  "Due at signing, including HST. Monthly charges continue at that rate plus HST.";

/** Ontario HST. CG doesn't currently need this configurable per client or
 * per province — flagged here as the one spot to change if that ever stops
 * being true, rather than a value copied into every surface that shows a
 * total. */
export const HST_RATE = 0.13;

export type ProposalLineItemInput = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  billingPeriod: ProposalBillingPeriod;
  isOptional: boolean;
  isSelected: boolean;
};

export type ProposalTotals = {
  /** Included items by billing period — every non-optional item, plus any
   * optional one the prospect has actually ticked. */
  oneOffSubtotal: number;
  annualSubtotal: number;
  monthlySubtotal: number;
  /** What the prospect could still add — the optional items NOT currently
   * selected, by period. Drives the "add-ons you can tick" strip, and the
   * muted "optional add-ons (if selected)" line in the staff editor. */
  optionalOneOffAvailable: number;
  optionalAnnualAvailable: number;
  optionalMonthlyAvailable: number;
  /** What's due at signing, before tax: the one-time work, the first
   * year's worth of anything annual, and the first month of anything
   * recurring monthly. */
  firstInvoiceSubtotal: number;
  taxRate: number;
  /** HST on firstInvoiceSubtotal only. The ongoing monthlySubtotal is taxed
   * again on every future invoice, but there's nothing to sum for invoices
   * that haven't happened yet — surfaces show that as "+ HST" next to the
   * recurring figure instead of a computed number. */
  taxAmount: number;
  /** firstInvoiceSubtotal + taxAmount — the actual number due at signing. */
  firstInvoiceTotal: number;
  includedItemCount: number;
};

/** Rounds to cents. Floats can't hold 0.1 exactly, so 3 × 19.99 lands on
 * 59.970000000000006 — harmless alone, visible once a dozen of them are
 * summed and printed next to a number the client is being asked to agree
 * to. Each line is rounded before it's added, never after; tax is
 * calculated on the already-rounded subtotal, the way an invoice does it,
 * not on a sum of unrounded lines. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTotal(item: ProposalLineItemInput): number {
  return round2(item.quantity * item.unitPrice);
}

/** An optional item counts toward the subtotal only once it's selected;
 * until then it sits in optional*Available. A non-optional item always
 * counts, whatever is_selected happens to say (that column is only
 * meaningful for optional rows). */
export function computeProposalTotals(items: ProposalLineItemInput[]): ProposalTotals {
  let oneOffSubtotal = 0;
  let annualSubtotal = 0;
  let monthlySubtotal = 0;
  let optionalOneOffAvailable = 0;
  let optionalAnnualAvailable = 0;
  let optionalMonthlyAvailable = 0;
  let includedItemCount = 0;

  for (const item of items) {
    const total = lineTotal(item);
    const included = !item.isOptional || item.isSelected;

    if (included) {
      includedItemCount += 1;
      if (item.billingPeriod === "monthly") monthlySubtotal += total;
      else if (item.billingPeriod === "annual") annualSubtotal += total;
      else oneOffSubtotal += total;
    } else if (item.billingPeriod === "monthly") {
      optionalMonthlyAvailable += total;
    } else if (item.billingPeriod === "annual") {
      optionalAnnualAvailable += total;
    } else {
      optionalOneOffAvailable += total;
    }
  }

  oneOffSubtotal = round2(oneOffSubtotal);
  annualSubtotal = round2(annualSubtotal);
  monthlySubtotal = round2(monthlySubtotal);

  const firstInvoiceSubtotal = round2(oneOffSubtotal + annualSubtotal + monthlySubtotal);
  const taxAmount = round2(firstInvoiceSubtotal * HST_RATE);

  return {
    oneOffSubtotal,
    annualSubtotal,
    monthlySubtotal,
    optionalOneOffAvailable: round2(optionalOneOffAvailable),
    optionalAnnualAvailable: round2(optionalAnnualAvailable),
    optionalMonthlyAvailable: round2(optionalMonthlyAvailable),
    firstInvoiceSubtotal,
    taxRate: HST_RATE,
    taxAmount,
    firstInvoiceTotal: round2(firstInvoiceSubtotal + taxAmount),
    includedItemCount,
  };
}

/** Money with cents.
 *
 * Not formatCurrency (src/lib/format.ts) — that one sets
 * maximumFractionDigits: 0, so it renders $1,234.56 as $1,235. That's right
 * for the dashboards it was written for and wrong for a number someone is
 * signing off on, and it's used widely enough that changing it isn't an
 * option. */
export function formatMoney(value: number | null | undefined, currency = "CAD"): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** The compact headline used for scanning — the proposals list, the
 * editor's sidebar, the email subject/body lead-in. Before tax, and each
 * period kept distinct rather than collapsed into one figure: "$4,800 one-
 * time + $1,200/year + $650/month" is the number an MSP client actually
 * needs, and summing periods together would misstate all of them. Where a
 * client is looking at a number they're about to agree to (the accept
 * panel, the email's big number), use totals.firstInvoiceTotal instead —
 * that one includes HST. */
export function formatProposalHeadline(totals: ProposalTotals, currency = "CAD"): string {
  const parts: string[] = [];
  if (totals.oneOffSubtotal > 0) parts.push(`${formatMoney(totals.oneOffSubtotal, currency)} one-time`);
  if (totals.annualSubtotal > 0) parts.push(`${formatMoney(totals.annualSubtotal, currency)}/year`);
  if (totals.monthlySubtotal > 0) parts.push(`${formatMoney(totals.monthlySubtotal, currency)}/month`);
  if (parts.length === 0) return formatMoney(0, currency);
  return parts.join(" + ");
}
