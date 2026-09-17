"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

const FILTER_THRESHOLD = 5;

export type M365IntunePolicyRow = {
  id: number;
  policy_kind: "configuration" | "compliance";
  display_name: string;
  modified_date_time: string | null;
};

/** Configuration policies come from a stable Graph v1.0 endpoint;
 * compliance policies only exist under /beta (Microsoft has no v1.0
 * equivalent) and can change without notice — flagged inline rather than
 * silently mixed in as if both were equally solid ground. Both need
 * DeviceManagementConfiguration.Read.All. */
export function ClientM365IntunePolicies({
  tenantId,
  policies,
}: {
  tenantId: string | null;
  policies: M365IntunePolicyRow[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);

  const visible = policies.filter((p) => {
    if (kind && p.policy_kind !== kind) return false;
    return matchesQuery(query, p.display_name);
  });

  const showFilters = policies.length > FILTER_THRESHOLD;
  const hasCompliance = policies.some((p) => p.policy_kind === "compliance");

  return (
    <CollapsibleCard title="Intune policies" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search policies…"
          toggles={[
            { value: "configuration", label: "Configuration" },
            { value: "compliance", label: "Compliance" },
          ]}
          activeToggle={kind}
          onToggle={setKind}
        />
      )}
      {hasCompliance && (
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-400">
          Compliance policies come from Microsoft&apos;s beta API — configuration policies use the
          stable one.
        </p>
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            Intune policies here.
          </p>
        ) : policies.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No Intune policy data found. Click &quot;Sync M365&quot; at the top of the page — if it
            still shows nothing, confirm this client is licensed for Intune and its Azure app
            registration has DeviceManagementConfiguration.Read.All admin-consented.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No policies match this filter.</p>
        ) : (
          visible.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{p.display_name}</p>
                {p.modified_date_time && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Last modified {formatDate(p.modified_date_time)}
                  </p>
                )}
              </div>
              <Badge value={p.policy_kind} />
            </div>
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}
