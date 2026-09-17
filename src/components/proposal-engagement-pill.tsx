import { formatAge, daysAgo } from "@/lib/format";
import type { ProposalStatus } from "@/lib/proposal-data";

/** The reason this feature is worth building, compressed into one pill.
 *
 * A proposal that's been opened four times this afternoon and still isn't
 * accepted is the single most actionable row on the page — someone is
 * interested, is probably showing it to a colleague, and is stuck on
 * something. That's a phone call today, not a follow-up email next week.
 * So it gets the amber "needs attention" tier from the badge system, and
 * it's deliberately louder than a proposal nobody has opened at all.
 *
 * This replaces a bare "sent" status badge on the list: for a quarterly
 * review "sent" is the finish line, but for a proposal it's the start of
 * the wait, and the interesting question is always what happened after. */
export function ProposalEngagementPill({
  status,
  viewCount,
  lastViewedAt,
  sentAt,
  validUntil,
  acceptedAt,
}: {
  status: ProposalStatus;
  viewCount: number;
  lastViewedAt: string | null;
  sentAt: string | null;
  validUntil: string | null;
  acceptedAt: string | null;
}) {
  // Nothing to say about engagement before it's gone out, or once it's
  // been answered — the status badge covers those.
  if (status === "draft" || acceptedAt || status === "declined" || status === "withdrawn") {
    return null;
  }

  const expiringInDays = validUntil ? -Number(daysAgo(validUntil) ?? 0) : null;
  const expirySuffix =
    status === "sent" && expiringInDays !== null && expiringInDays >= 0 && expiringInDays <= 3
      ? expiringInDays === 0
        ? " · expires today"
        : ` · expires in ${expiringInDays}d`
      : "";

  let tone = "bg-slate-100 text-slate-500";
  let text: string;

  if (viewCount === 0) {
    text = sentAt ? "Sent · not opened yet" : "Not sent";
  } else if (viewCount >= 3) {
    // Read repeatedly, still no answer — the call-them-now row.
    tone = "bg-amber-100 text-amber-800";
    text = `Opened ${viewCount}× · last ${formatAge(lastViewedAt)} ago`;
  } else {
    tone = "bg-blue-100 text-blue-700";
    text = `Opened ${viewCount}× · ${formatAge(lastViewedAt)} ago`;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {text}
      {expirySuffix}
    </span>
  );
}
