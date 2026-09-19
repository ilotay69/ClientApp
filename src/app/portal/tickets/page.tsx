import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { readPortalFilters } from "@/lib/portal-filters";
import { fetchTicketsSection, normalizeLookbackDays } from "@/lib/portal-sections";
import { MAX_LOOKBACK_DAYS } from "@/lib/portal-data";
import { PortalPageHeader, PortalCard, EmptyRow } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalTicketsTable } from "@/components/portal-tickets-table";
import { PortalUnavailable } from "@/components/portal-unavailable";

export const dynamic = "force-dynamic";

const DAY_OPTIONS = [30, 60, 90] as const; // 90 === MAX_LOOKBACK_DAYS

export default async function PortalTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "tickets");
  if (!session) redirect("/portal");

  const filters = readPortalFilters("tickets", params);
  const { rows, totalBeforeFilter, unavailableReason, facets } = await fetchTicketsSection(
    session,
    filters
  );
  const days = normalizeLookbackDays(filters.days);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Open Tickets"
        subtitle="Support tickets still being worked, with the updates and time logged against each."
        isPreview={session.isPreview}
      />

      {unavailableReason ? (
        <PortalUnavailable>{unavailableReason}</PortalUnavailable>
      ) : (
        <>
        {/* Inside the available branch on purpose: the bar carries the
            download buttons, and offering a CSV of a section that has no
            data to give lands the client on a bare error response. */}
        <PortalFilterBar
          section="tickets"
          searchPlaceholder="Search tickets…"
          downloads={{ csv: true, pdf: true }}
          resultLabel={`${rows.length} of ${totalBeforeFilter} open`}
          selects={[
            {
              key: "days",
              label: "Opened or active in",
              options: DAY_OPTIONS.map((d) => ({ value: String(d), label: `Last ${d} days` })),
            },
            { key: "status", label: "Status", options: facets.status ?? [] },
            { key: "priority", label: "Priority", options: facets.priority ?? [] },
          ]}
        />

        <PortalCard
          title={`${rows.length} ticket${rows.length === 1 ? "" : "s"}`}
          action={
            <span className="text-xs text-slate-400">
              {days === MAX_LOOKBACK_DAYS ? "Last 90 days" : `Last ${days} days`}
            </span>
          }
        >
          {totalBeforeFilter === 0 ? (
            <EmptyRow>
              No open tickets in the last {days} days — nothing is outstanding with our service
              desk.
            </EmptyRow>
          ) : (
            <PortalTicketsTable tickets={rows} />
          )}
        </PortalCard>
        </>
      )}
    </div>
  );
}
