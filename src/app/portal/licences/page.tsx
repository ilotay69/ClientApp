import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { fetchPortalLicences } from "@/lib/portal-data";
import {
  PortalPageHeader,
  PortalCard,
  StatCard,
  EmptyRow,
  ProportionBar,
} from "@/components/portal-ui";
import { friendlyM365SkuName } from "@/lib/m365-sku-names";

export const dynamic = "force-dynamic";

export default async function PortalLicencesPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const session = await requirePortalSession(preview);
  if (!session) redirect("/portal");

  const { licences, lastSyncedAt, linked } = await fetchPortalLicences(session);

  const assigned = licences.reduce((s, l) => s + l.consumedUnits, 0);
  const available = licences.reduce((s, l) => s + l.enabledUnits, 0);
  const spare = available - assigned;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Microsoft 365"
        subtitle="Licences on your tenant and how many are in use."
        isPreview={session.isPreview}
        lastSyncedAt={lastSyncedAt}
      />

      {!linked ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Microsoft 365 reporting isn&apos;t set up for your account yet.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Licences assigned" value={String(assigned)} />
            <StatCard label="Licences available" value={String(available)} />
            <StatCard
              label="Unassigned"
              value={String(spare)}
              hint={spare > 0 ? "paid for but not in use" : "fully allocated"}
              tone={spare > 0 ? "warn" : "good"}
            />
          </div>

          <PortalCard title="By subscription">
            {licences.length === 0 ? (
              <EmptyRow>No licence data has synced yet.</EmptyRow>
            ) : (
              <div className="space-y-5 px-5 py-4">
                {licences.map((l) => (
                  <ProportionBar
                    key={l.skuPartNumber}
                    label={friendlyM365SkuName(l.skuPartNumber)}
                    used={l.consumedUnits}
                    total={l.enabledUnits}
                    valueLabel={`${l.consumedUnits} / ${l.enabledUnits} assigned`}
                  />
                ))}
              </div>
            )}
          </PortalCard>
        </>
      )}
    </div>
  );
}
