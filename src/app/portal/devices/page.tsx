import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { readPortalFilters } from "@/lib/portal-filters";
import { fetchDevicesSection } from "@/lib/portal-sections";
import { PortalPageHeader, PortalCard, StatCard, EmptyRow } from "@/components/portal-ui";
import { PortalFilterBar } from "@/components/portal-filter-bar";
import { PortalUnavailable } from "@/components/portal-unavailable";
import { formatDate, humanizeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Badge from @/components/badge derives its own text from the value via
 * humanizeLabel, so it can't render "Online"/"Offline" off a boolean — a
 * plain pill is clearer than bending a status vocabulary to fit. */
function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {online ? "Online" : "Offline"}
    </span>
  );
}

function gb(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

function diskLabel(free: number | null, total: number | null): string {
  if (!total || total <= 0) return "—";
  const usedPct = Math.round(((total - (free ?? 0)) / total) * 100);
  return `${usedPct}% of ${gb(total)}`;
}

export default async function PortalDevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "devices");
  if (!session) redirect("/portal");

  const filters = readPortalFilters("devices", params);
  const { rows, totalBeforeFilter, unavailableReason, lastSyncedAt, facets } =
    await fetchDevicesSection(session, filters);

  const online = rows.filter((d) => d.isOffline === false).length;
  const servers = rows.filter((d) => (d.nodeClass ?? "").toUpperCase().includes("SERVER")).length;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Devices"
        subtitle="Every endpoint we monitor for you, with its hardware and health."
        isPreview={session.isPreview}
        lastSyncedAt={lastSyncedAt}
      />

      {unavailableReason ? (
        <PortalUnavailable>{unavailableReason}</PortalUnavailable>
      ) : (
        <>
          <PortalFilterBar
            section="devices"
            searchPlaceholder="Search devices…"
            downloads={{ csv: true, pdf: true }}
            resultLabel={`${rows.length} of ${totalBeforeFilter} devices`}
            selects={[
              {
                key: "status",
                label: "Status",
                options: [
                  { value: "online", label: "Online" },
                  { value: "offline", label: "Offline" },
                ],
              },
              {
                key: "class",
                label: "Type",
                options: (facets.class ?? []).map((f) => ({ ...f, label: humanizeLabel(f.value) })),
              },
              { key: "os", label: "OS", options: facets.os ?? [] },
            ]}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Devices shown" value={String(rows.length)} />
            <StatCard
              label="Online"
              value={String(online)}
              hint={`${rows.length - online} offline`}
              tone={rows.length > 0 && online === rows.length ? "good" : "warn"}
            />
            <StatCard label="Servers" value={String(servers)} />
            <StatCard label="Workstations" value={String(rows.length - servers)} />
          </div>

          <PortalCard title="All devices">
            {rows.length === 0 ? (
              <EmptyRow>
                {totalBeforeFilter === 0
                  ? "No devices have synced for your account yet."
                  : "No devices match these filters."}
              </EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Device</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Status</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Type</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Operating system</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Model</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Specs</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Disk used</th>
                      <th className="px-5 py-2 text-left font-medium text-slate-500">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((d) => (
                      <tr key={d.id}>
                        <td className="px-5 py-2 font-medium text-slate-900">{d.systemName}</td>
                        <td className="px-5 py-2">
                          <StatusPill online={d.isOffline === false} />
                        </td>
                        <td className="px-5 py-2 text-slate-600">
                          {d.nodeClass ? humanizeLabel(d.nodeClass) : "—"}
                        </td>
                        <td className="px-5 py-2 text-slate-600">{d.osName ?? "—"}</td>
                        <td className="px-5 py-2 text-slate-600">
                          {[d.manufacturer, d.model].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-5 py-2 text-slate-600">
                          {[d.cpuModel, gb(d.ramBytes) ? `${gb(d.ramBytes)} RAM` : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="px-5 py-2 text-slate-600">
                          {diskLabel(d.diskFreeBytes, d.diskTotalBytes)}
                        </td>
                        <td className="px-5 py-2 text-slate-600">
                          {d.lastContact ? formatDate(d.lastContact) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PortalCard>
        </>
      )}
    </div>
  );
}
