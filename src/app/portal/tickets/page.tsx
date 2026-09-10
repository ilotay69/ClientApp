import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import {
  fetchPortalTicketList,
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
} from "@/lib/portal-data";
import { PortalPageHeader, PortalCard } from "@/components/portal-ui";
import { PortalTicketsTable } from "@/components/portal-tickets-table";

export const dynamic = "force-dynamic";

const DAY_OPTIONS = [30, 60, 90] as const; // 90 === MAX_LOOKBACK_DAYS

function normalizeDays(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.max(n, 1), MAX_LOOKBACK_DAYS);
}

export default async function PortalTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; days?: string }>;
}) {
  const { preview, days: rawDays } = await searchParams;
  const session = await requirePortalSession(preview);
  if (!session) redirect("/portal");

  const days = normalizeDays(rawDays);
  // Open tickets only — fetchPortalTicketList already excludes closed ones.
  const { tickets, unavailableReason } = await fetchPortalTicketList(session, days);

  const buildHref = (overrideDays: number) => {
    const params = new URLSearchParams({ days: String(overrideDays) });
    if (preview) params.set("preview", preview);
    return `/portal/tickets?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Tickets"
        subtitle="Open support tickets for your account, with billable time logged against each."
        isPreview={session.isPreview}
      />

      <div className="flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <span className="text-slate-500">Lookback:</span>
        {DAY_OPTIONS.map((d) => (
          <Link
            key={d}
            href={buildHref(d)}
            className={`rounded-md px-3 py-1.5 font-medium ${
              days === d
                ? "bg-brand text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {d}d
          </Link>
        ))}
      </div>

      {unavailableReason ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">{unavailableReason}</p>
        </div>
      ) : (
        <PortalCard title={`${tickets.length} open ticket${tickets.length === 1 ? "" : "s"}`}>
          <PortalTicketsTable tickets={tickets} />
        </PortalCard>
      )}
    </div>
  );
}
