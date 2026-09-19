import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { readPortalFilters } from "@/lib/portal-filters";
import { fetchMailboxSection } from "@/lib/portal-sections";
import { PortalPageHeader, PortalCard, StatCard, EmptyRow, ProportionBar } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalUnavailable } from "@/components/portal-unavailable";

export const dynamic = "force-dynamic";

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export default async function PortalMailboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "mailbox");
  if (!session) redirect("/portal");

  const filters = readPortalFilters("mailbox", params);
  const { rows, totalBeforeFilter, unavailableReason, lastSyncedAt, facets } =
    await fetchMailboxSection(session, filters);

  const critical = rows.filter((m) => m.band === "Critical").length;
  const warning = rows.filter((m) => m.band === "Warning").length;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Mailbox Usage"
        subtitle="How close each mailbox is to its storage limit."
        isPreview={session.isPreview}
        lastSyncedAt={lastSyncedAt}
      />

      {unavailableReason ? (
        <PortalUnavailable>{unavailableReason}</PortalUnavailable>
      ) : (
        <>
          <PortalFilterBar
            section="mailbox"
            searchPlaceholder="Search mailboxes…"
            downloads={{ csv: true, pdf: false }}
            resultLabel={`${rows.length} of ${totalBeforeFilter} mailboxes`}
            selects={[{ key: "usage", label: "Status", options: facets.usage ?? [] }]}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Mailboxes" value={String(rows.length)} />
            <StatCard
              label="Over 75% full"
              value={String(warning)}
              tone={warning > 0 ? "warn" : "good"}
            />
            <StatCard
              label="Over 90% full"
              value={String(critical)}
              hint={critical > 0 ? "at risk of refusing mail" : "none at risk"}
              tone={critical > 0 ? "bad" : "good"}
            />
          </div>

          <PortalCard title="By mailbox">
            {rows.length === 0 ? (
              <EmptyRow>
                {totalBeforeFilter === 0
                  ? "No mailbox usage has synced for your Microsoft 365 tenant yet."
                  : "No mailboxes match these filters."}
              </EmptyRow>
            ) : (
              <div className="space-y-5 px-5 py-4">
                {rows.map((m) => (
                  <ProportionBar
                    key={m.userPrincipalName}
                    label={m.displayName || m.userPrincipalName}
                    used={m.storageUsedBytes}
                    total={m.quotaBytes}
                    valueLabel={`${gb(m.storageUsedBytes)} of ${gb(m.quotaBytes)} · ${Math.round(m.percentUsed)}%`}
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
