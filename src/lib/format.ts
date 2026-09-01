import { differenceInCalendarDays, format, isPast, parseISO } from "date-fns";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function isOverdue(dateStr: string | null | undefined) {
  if (!dateStr) return false;
  return isPast(parseISO(dateStr));
}

/** A service check with no last-checked date is treated as overdue — it's
 * never been done, so there's nothing to wait out a cadence from. */
export function isServiceCheckOverdue(
  lastCheckedAt: string | null | undefined,
  cadenceDays: number
) {
  if (!lastCheckedAt) return true;
  const dueBy = new Date(parseISO(lastCheckedAt));
  dueBy.setDate(dueBy.getDate() + cadenceDays);
  return isPast(dueBy);
}

export function daysAgo(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return differenceInCalendarDays(new Date(), parseISO(dateStr));
}

export function humanizeLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
