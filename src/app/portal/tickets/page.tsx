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
const STATUS_OPTIONS = ["open", "closed", "all"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

function normalizeDays(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return DEFAULT_LOOKBACK_DAYS;
  return Math.min(Math.max(n, 1), MAX_LOOKBACK_DAYS);
}

function normalizeStatus(raw: string | undefined): StatusFilter {
  return (STATUS_OPTIONS as readonly string[]).includes(raw ?? "") ? (raw as StatusFilter) : "open";
}

export default async function PortalTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; days?: string; status?: string }>;
}) {
  const { preview, days: rawDays, status: rawStatus } = await searchParams;
  const session = await requirePortalSession(preview);
  if (!session) redirect("/portal");

  const days = normalizeDays(rawDays);
  const status = normalizeStatus(rawStatus);
  const { tickets, unavailableReason } = await fetchPortalTicketList(session, days);
  const filtered = tickets.filter((t) =>
    status === "all" ? true : status === "open" ? t.isOpen : !t.isOpen
  );

  // Plain links + URLSearchParams, same pattern as /portal/contracts' month
  // stepper — status/days changes are real navigations (this page is
  // force-dynamic, so every click re-renders server-side and re-fetches
  // Autotask live), not a client-only toggle.
  const buildHref = (overrides: { days?: number; status?: StatusFilter }) => {
    const params = new URLSearchParams({
      days: String(overrides.days ?? days),
      status: overrides.status ?? status,
    });
    if (preview) params.set("preview", preview);
    return `/portal/tickets?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Tickets"
        subtitle="Support tickets for your account."
        isPreview={session.isPreview}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Show:</span>
          {STATUS_OPTIONS.map((s) => (
            <Link
              key={s}
              href={buildHref({ status: s })}
              className={`rounded-md px-3 py-1.5 font-medium ${
                status === s
                  ? "bg-brand text-white"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {s === "open" ? "Open" : s === "closed" ? "Closed" : "All"}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Lookback:</span>
          {DAY_OPTIONS.map((d) => (
            <Link
              key={d}
              href={buildHref({ days: d })}
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
      </div>

      {unavailableReason ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">{unavailableReason}</p>
        </div>
      ) : (
        <PortalCard title={`${filtered.length} ticket${filtered.length === 1 ? "" : "s"}`}>
          <PortalTicketsTable tickets={filtered} />
        </PortalCard>
      )}
    </div>
  );
}
