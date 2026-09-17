import Link from "next/link";
import { Badge } from "@/components/badge";
import { ProposalEngagementPill } from "@/components/proposal-engagement-pill";
import { formatAge } from "@/lib/format";
import { formatProposalHeadline } from "@/lib/proposal-totals";
import type { ProposalListItem } from "@/lib/proposal-data";

/** One proposal in the list. Wraps on a phone the same way task-row and
 * sales-request-row do — the title takes the first line on its own and the
 * money/engagement meta flows underneath, rather than being hidden or
 * squeezed. */
export function ProposalListRow({ proposal }: { proposal: ProposalListItem }) {
  return (
    <Link
      href={`/proposals/${proposal.id}`}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50 sm:flex-nowrap sm:px-5"
    >
      <span className="order-first w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
        <span className="block truncate text-sm font-medium text-slate-900">{proposal.title}</span>
        <span className="block truncate text-xs text-slate-500">{proposal.recipientLabel}</span>
      </span>

      <span className="shrink-0 text-sm tabular-nums text-slate-700">
        {formatProposalHeadline(proposal.totals, proposal.currency)}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        <ProposalEngagementPill
          status={proposal.status}
          viewCount={proposal.viewCount}
          lastViewedAt={proposal.lastViewedAt}
          sentAt={proposal.sentAt}
          validUntil={proposal.validUntil}
          acceptedAt={proposal.acceptedAt}
        />
        {/* Never a bare "sent" badge — see ProposalEngagementPill. */}
        {proposal.status !== "sent" && <Badge value={proposal.status} />}
      </span>

      <span className="w-20 shrink-0 text-right text-xs text-slate-400">
        {formatAge(proposal.updatedAt)}
      </span>
    </Link>
  );
}
