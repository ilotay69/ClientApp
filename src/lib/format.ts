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

/** Deterministic "what's outstanding" line for a client, used wherever
 * there's no AI-generated insight to show yet — the Clients list and a
 * client's own page both call this so the two never disagree. Prefers a
 * specific stale ticket over a bare count when one exists. */
export function buildFollowupSummary({
  taskCount,
  ticketCount,
  stalestTicketTitle,
  stalestTicketDays,
  lastContactDays,
}: {
  taskCount: number;
  ticketCount: number;
  stalestTicketTitle: string | null;
  stalestTicketDays: number | null;
  lastContactDays: number | null;
}): string | null {
  const parts: string[] = [];
  if (stalestTicketDays !== null && stalestTicketDays >= 3 && stalestTicketTitle) {
    parts.push(`"${stalestTicketTitle}" untouched ${stalestTicketDays}d`);
  } else if (ticketCount > 0) {
    parts.push(`${ticketCount} open ticket${ticketCount === 1 ? "" : "s"}`);
  }
  if (taskCount > 0) parts.push(`${taskCount} open task${taskCount === 1 ? "" : "s"}`);
  if (lastContactDays !== null) parts.push(`last contact ${lastContactDays}d ago`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function humanizeLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
