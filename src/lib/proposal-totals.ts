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

export type ProposalBillingPeriod = "one_off" | "monthly";

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
  /** One-off items that are included — i.e. every non-optional item, plus
   * any optional one the prospect has actually ticked. */
  oneOffSubtotal: number;
  monthlySubtotal: number;
  /** What the prospect could still add — the optional items NOT currently
   * selected. Drives the "add-ons you can tick" strip, and the muted
   * "optional add-ons (if selected)" line in the staff editor. */
  optionalOneOffAvailable: number;
  optionalMonthlyAvailable: number;
  /** What they'd be billed first: the one-off work plus the first month.
   * Before taxes — nothing here models tax, and every surface that prints
   * this must say so. */
  firstInvoiceTotal: number;
  includedItemCount: number;
};

/** Rounds to cents. Floats can't hold 0.1 exactly, so 3 × 19.99 lands on
 * 59.970000000000006 — harmless alone, visible once a dozen of them are
 * summed and printed next to a number the client is being asked to agree
 * to. Each line is rounded before it's added, never after. */
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
  let monthlySubtotal = 0;
  let optionalOneOffAvailable = 0;
  let optionalMonthlyAvailable = 0;
  let includedItemCount = 0;

  for (const item of items) {
    const total = lineTotal(item);
    const included = !item.isOptional || item.isSelected;

    if (included) {
      includedItemCount += 1;
      if (item.billingPeriod === "monthly") monthlySubtotal += total;
      else oneOffSubtotal += total;
    } else if (item.billingPeriod === "monthly") {
      optionalMonthlyAvailable += total;
    } else {
      optionalOneOffAvailable += total;
    }
  }

  oneOffSubtotal = round2(oneOffSubtotal);
  monthlySubtotal = round2(monthlySubtotal);

  return {
    oneOffSubtotal,
    monthlySubtotal,
    optionalOneOffAvailable: round2(optionalOneOffAvailable),
    optionalMonthlyAvailable: round2(optionalMonthlyAvailable),
    firstInvoiceTotal: round2(oneOffSubtotal + monthlySubtotal),
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

/** The headline a proposal gets in the list, the email and the accept bar.
 * One-off and recurring are kept distinct rather than collapsed into a
 * single figure — "$4,800 + $650/month" is the number an MSP client
 * actually needs to see, and summing them would misstate both. */
export function formatProposalHeadline(totals: ProposalTotals, currency = "CAD"): string {
  const parts: string[] = [];
  if (totals.oneOffSubtotal > 0) parts.push(formatMoney(totals.oneOffSubtotal, currency));
  if (totals.monthlySubtotal > 0) parts.push(`${formatMoney(totals.monthlySubtotal, currency)}/month`);
  if (parts.length === 0) return formatMoney(0, currency);
  return parts.join(" + ");
}
