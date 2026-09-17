"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate, humanizeLabel } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

const FILTER_THRESHOLD = 5;

export type M365ConditionalAccessPolicyRow = {
  id: number;
  policy_id: string;
  display_name: string;
  state: string;
  created_date_time: string | null;
  modified_date_time: string | null;
};

const STATE_LABELS: Record<string, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  enabledForReportingButNotEnforced: "Report-only",
};

/** Requires Policy.Read.All, admin-consented on this client's own Azure app
 * registration — not yet requested on any client's app as of when this
 * tab was added, so tenantId !== null but policies.length === 0 more often
 * means "not consented yet" than "no policies exist". The sync itself
 * isolates a 403 here from the rest of the M365 sync (see
 * syncM365ConditionalAccessAndIntune), so this just shows the same
 * "click Sync M365" placeholder either way — there's nothing this tab can
 * distinguish between the two without a second, noisier signal. */
export function ClientM365ConditionalAccess({
  tenantId,
  policies,
}: {
  tenantId: string | null;
  policies: M365ConditionalAccessPolicyRow[];
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<string | null>(null);

  const states = Array.from(new Set(policies.map((p) => p.state))).sort();

  const visible = policies.filter((p) => {
    if (state && p.state !== state) return false;
    return matchesQuery(query, p.display_name);
  });

  const showFilters = policies.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="Conditional Access policies" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search policies…"
          toggles={states.map((s) => ({ value: s, label: STATE_LABELS[s] ?? humanizeLabel(s) }))}
          activeToggle={state}
          onToggle={setState}
        />
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            Conditional Access policies here.
          </p>
        ) : policies.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No Conditional Access data found. Click &quot;Sync M365&quot; at the top of the page —
            if it still shows nothing, this client&apos;s Azure app registration likely needs
            Policy.Read.All admin-consented.
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
              <Badge value={p.state} label={STATE_LABELS[p.state] ?? humanizeLabel(p.state)} />
            </div>
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}
