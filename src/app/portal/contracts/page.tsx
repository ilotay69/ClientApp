import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { fetchPortalActiveContractUsage, fetchPortalContractServices } from "@/lib/portal-data";
import { PortalPageHeader, PortalCard, StatCard, ProportionBar, EmptyRow } from "@/components/portal-ui";
import { Badge } from "@/components/badge";

export const dynamic = "force-dynamic";

export default async function PortalContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const session = await requirePortalSession(preview, "contracts");
  if (!session) redirect("/portal");

  const [data, contractServices] = await Promise.all([
    fetchPortalActiveContractUsage(session),
    fetchPortalContractServices(session),
  ]);

  const totalPurchased = data.blocks.reduce((s, b) => s + b.purchased, 0);
  const totalUsed = data.blocks.reduce((s, b) => s + b.used, 0);
  const totalRemaining = totalPurchased - totalUsed;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Contracts"
        subtitle="What's contracted, plus your active prepaid hour block and how much of it is used."
        isPreview={session.isPreview}
      />

      {contractServices.linked && (
        <PortalCard title={`Contracted services (${contractServices.services.length})`}>
          {contractServices.services.length === 0 ? (
            <EmptyRow>No contracted services found.</EmptyRow>
          ) : (
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
          )}
        </PortalCard>
      )}

      {data.unavailableReason ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">{data.unavailableReason}</p>
        </div>
      ) : data.blocks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">No active prepaid hour block right now.</p>
        </div>
      ) : (
        <>
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

          <PortalCard title="Current block usage">
            <div className="space-y-5 px-5 py-4">
              {data.blocks.map((b) => (
                <ProportionBar
                  key={`${b.contractId}-${b.startDate}`}
                  label={b.contractName}
                  used={b.used}
                  total={b.purchased}
                  valueLabel={`${b.used.toFixed(1)} / ${b.purchased.toFixed(1)} hrs · ${Math.round(b.percentUsed)}%`}
                />
              ))}
            </div>
          </PortalCard>
        </>
      )}
    </div>
  );
}
