import { differenceInCalendarDays, format, formatDistanceToNowStrict, isPast, parseISO } from "date-fns";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

/** Same as formatDate, plus the time — for a "when was this actually
 * created" moment (e.g. a ticket's createDate) where the date alone loses
 * how many hours it's actually been sitting there. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy h:mm a");
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

export function daysAgo(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return differenceInCalendarDays(new Date(), parseISO(dateStr));
}

/** "how long has this been sitting" — e.g. "3 hours", "2 days" — for a
 * queue-age column, where day-level granularity (daysAgo) would show "0"
 * for anything created today even if it's been sitting for 20 hours. */
export function formatAge(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return formatDistanceToNowStrict(parseISO(value));
  } catch {
    return "—";
  }
}

/** Deterministic "what's outstanding" line for a client, used wherever
 * there's no AI-generated insight to show yet — the Clients list and a
 * client's own page both call this so the two never disagree. Prefers a
 * specific stale ticket over a bare count when one exists. */
export function buildFollowupSummary({
  taskCount,
  overdueTaskCount,
  ticketCount,
  stalestTicketTitle,
  stalestTicketDays,
  lastContactDays,
}: {
  taskCount: number;
  overdueTaskCount: number;
  ticketCount: number;
  stalestTicketTitle: string | null;
  stalestTicketDays: number | null;
  lastContactDays: number | null;
}): string | null {
  const parts: string[] = [];
  // Overdue tasks lead — the single most actionable signal here.
  if (overdueTaskCount > 0) {
    parts.push(`${overdueTaskCount} task${overdueTaskCount === 1 ? "" : "s"} overdue`);
  } else if (taskCount > 0) {
    parts.push(`${taskCount} open task${taskCount === 1 ? "" : "s"}`);
  }
  if (stalestTicketDays !== null && stalestTicketDays >= 3 && stalestTicketTitle) {
    parts.push(`"${stalestTicketTitle}" untouched ${stalestTicketDays}d`);
  } else if (ticketCount > 0) {
    parts.push(`${ticketCount} open ticket${ticketCount === 1 ? "" : "s"}`);
  }
  if (lastContactDays !== null) parts.push(`last contact ${lastContactDays}d ago`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function humanizeLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
