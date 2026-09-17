"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatAge, humanizeLabel } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

const FILTER_THRESHOLD = 5;

export type M365IntuneDeviceRow = {
  id: number;
  device_name: string;
  operating_system: string | null;
  os_version: string | null;
  compliance_state: string | null;
  user_principal_name: string | null;
  model: string | null;
  manufacturer: string | null;
  last_sync_date_time: string | null;
};

/** Requires DeviceManagementManagedDevices.Read.All (app-only, per
 * Microsoft's own docs) and an active Intune license on the tenant — a
 * tenant with M365 but no Intune assignment gets a clean empty list here,
 * not an error, so an empty state can mean "not consented yet", "no
 * Intune license", or genuinely "no enrolled devices". */
export function ClientM365IntuneDevices({
  tenantId,
  devices,
}: {
  tenantId: string | null;
  devices: M365IntuneDeviceRow[];
}) {
  const [query, setQuery] = useState("");
  const [compliance, setCompliance] = useState<string | null>(null);

  const complianceStates = Array.from(
    new Set(devices.map((d) => d.compliance_state).filter((c): c is string => Boolean(c)))
  ).sort();

  const visible = devices.filter((d) => {
    if (compliance && d.compliance_state !== compliance) return false;
    return matchesQuery(query, d.device_name, d.user_principal_name, d.model, d.manufacturer);
  });

  const showFilters = devices.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="Intune devices" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search devices…"
          toggles={complianceStates.map((c) => ({ value: c, label: humanizeLabel(c) }))}
          activeToggle={compliance}
          onToggle={setCompliance}
        />
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            Intune devices here.
          </p>
        ) : devices.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No Intune device data found. Click &quot;Sync M365&quot; at the top of the page — if it
            still shows nothing, confirm this client is licensed for Intune and its Azure app
            registration has DeviceManagementManagedDevices.Read.All admin-consented.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No devices match this filter.</p>
        ) : (
          visible.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{d.device_name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {[d.operating_system, d.os_version, d.user_principal_name].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-slate-400">
                  {d.last_sync_date_time ? `synced ${formatAge(d.last_sync_date_time)} ago` : "never synced"}
                </span>
                {d.compliance_state && (
                  <Badge value={d.compliance_state} label={humanizeLabel(d.compliance_state)} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}
