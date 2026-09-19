import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { readPortalFilters } from "@/lib/portal-filters";
import { fetchContractSection } from "@/lib/portal-sections";
import { fetchPortalContractServices } from "@/lib/portal-data";
import { PortalPageHeader, PortalCard, StatCard, ProportionBar, EmptyRow } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalUnavailable } from "@/components/portal-unavailable";
import { PortalDateRange } from "@/components/portal-date-range";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "contracts");
  if (!session) redirect("/portal");

  const filters = readPortalFilters("contracts", params);
  const [usage, contractServices] = await Promise.all([
    fetchContractSection(session, filters),
    fetchPortalContractServices(session),
  ]);

  const shownEntries = usage.rows.reduce((s, b) => s + b.entries.length, 0);
  const totalPurchased = usage.rows.reduce((s, b) => s + b.purchased, 0);
  const totalUsed = usage.rows.reduce((s, b) => s + b.used, 0);
  const totalRemaining = totalPurchased - totalUsed;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Contract & Time"
        subtitle="Your active prepaid hour block, and every hour logged against it."
        isPreview={session.isPreview}
      />

      {contractServices.linked && contractServices.services.length > 0 && (
        <PortalCard title={`Contracted services (${contractServices.services.length})`}>
          <div className="divide-y divide-slate-100">
            {contractServices.services.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 px-5 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {s.serviceName}
                    {s.quantity !== null ? ` × ${s.quantity}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.contractName}
                    {s.description ? ` · ${s.description}` : ""}
                  </p>
                </div>
                {s.contractStatus && <Badge value={s.contractStatus} />}
              </div>
            ))}
          </div>
        </PortalCard>
      )}

      {usage.unavailableReason ? (
        <PortalUnavailable>{usage.unavailableReason}</PortalUnavailable>
      ) : (
        <>
          {/* Block totals sit ABOVE the filter bar deliberately. They describe
              the contract, not the filtered view, and a date filter must not
              be able to make a client think they bought fewer hours. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Purchased" value={totalPurchased.toFixed(1)} hint="hours in the current block" />
            <StatCard label="Used" value={totalUsed.toFixed(1)} hint="billable hours drawn down" />
            <StatCard
              label="Remaining"
              value={totalRemaining.toFixed(1)}
              hint="hours left"
              tone={
                totalRemaining <= 0
                  ? "bad"
                  : totalPurchased > 0 && totalRemaining / totalPurchased < 0.2
                    ? "warn"
                    : "good"
              }
            />
          </div>

          <PortalFilterBar
            section="contracts"
            searchPlaceholder="Search time entries…"
            downloads={{ csv: true, pdf: true }}
            resultLabel={`${shownEntries} of ${usage.totalBeforeFilter} entries`}
            selects={[{ key: "resource", label: "Engineer", options: usage.facets.resource ?? [] }]}
          >
            <PortalDateRange />
          </PortalFilterBar>

          {usage.rows.map((block) => (
            <PortalCard
              key={`${block.contractId}-${block.startDate}`}
              title={block.contractName}
              action={
                <span className="text-xs text-slate-400">
                  {formatDate(block.startDate)} – {formatDate(block.endDate)}
                </span>
              }
            >
              <div className="px-5 py-4">
                <ProportionBar
                  label="Block usage"
                  used={block.used}
                  total={block.purchased}
                  valueLabel={`${block.used.toFixed(1)} / ${block.purchased.toFixed(1)} hrs · ${Math.round(block.percentUsed)}%`}
                />
              </div>

              <details className="group border-t border-slate-100">
                <summary className="cursor-pointer list-none px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <span className="group-open:hidden">Show time entries ({block.entries.length})</span>
                  <span className="hidden group-open:inline">Hide time entries ({block.entries.length})</span>
                </summary>

                {block.entries.length === 0 ? (
                  <EmptyRow>No time entries match these filters.</EmptyRow>
                ) : (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-2 text-left font-medium text-slate-500">Date</th>
                          <th className="px-5 py-2 text-left font-medium text-slate-500">Engineer</th>
                          <th className="px-5 py-2 text-left font-medium text-slate-500">Ticket</th>
                          <th className="px-5 py-2 text-left font-medium text-slate-500">Work done</th>
                          <th className="px-5 py-2 text-right font-medium text-slate-500">Hours</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {block.entries.map((e) => (
                          <tr key={e.id}>
                            <td className="whitespace-nowrap px-5 py-2 text-slate-600">
                              {formatDate(e.dateWorked)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-2 text-slate-600">
                              {e.resourceName ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-5 py-2 text-slate-600">
                              {e.ticketId ?? "—"}
                            </td>
                            <td className="px-5 py-2 text-slate-700">
                              {e.summaryNotes || "—"}
                              {e.isNonBillable && (
                                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                  Not billable
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-5 py-2 text-right text-slate-600">
                              {e.hoursToBill.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
            </PortalCard>
          ))}
        </>
      )}
    </div>
  );
}
