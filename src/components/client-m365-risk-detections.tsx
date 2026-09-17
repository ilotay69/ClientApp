"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDateTime, humanizeLabel } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

const FILTER_THRESHOLD = 5;

export type M365RiskDetectionRow = {
  id: number;
  user_principal_name: string | null;
  display_name: string | null;
  risk_event_type: string | null;
  risk_level: string | null;
  risk_state: string | null;
  ip_address: string | null;
  detected_date_time: string | null;
};

/** Requires IdentityRiskEvent.Read.All, plus an Entra ID P1 or P2 license
 * on the tenant (Microsoft's own requirement for this specific API, not
 * something CG's app can work around) — a tenant on a plan without it
 * gets a clean empty list, same as an unconsented one. */
export function ClientM365RiskDetections({
  tenantId,
  detections,
}: {
  tenantId: string | null;
  detections: M365RiskDetectionRow[];
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string | null>(null);

  const levels = Array.from(
    new Set(detections.map((d) => d.risk_level).filter((l): l is string => Boolean(l)))
  ).sort();

  const visible = detections.filter((d) => {
    if (level && d.risk_level !== level) return false;
    return matchesQuery(query, d.display_name, d.user_principal_name, d.risk_event_type);
  });

  const showFilters = detections.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="Risk detections" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search detections…"
          toggles={levels.map((l) => ({ value: l, label: humanizeLabel(l) }))}
          activeToggle={level}
          onToggle={setLevel}
        />
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            risk detections here.
          </p>
        ) : detections.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No risk detections found. Click &quot;Sync M365&quot; at the top of the page — if it
            still shows nothing, confirm this client&apos;s Azure app registration has
            IdentityRiskEvent.Read.All admin-consented and the tenant has an Entra ID P1 or P2
            license.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No detections match this filter.</p>
        ) : (
          visible.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {d.display_name ?? d.user_principal_name ?? "Unknown user"}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {[
                    d.risk_event_type ? humanizeLabel(d.risk_event_type) : null,
                    d.ip_address,
                    d.detected_date_time ? formatDateTime(d.detected_date_time) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {d.risk_state && <Badge value={d.risk_state} label={humanizeLabel(d.risk_state)} />}
                {d.risk_level && <Badge value={d.risk_level} />}
              </div>
            </div>
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}
