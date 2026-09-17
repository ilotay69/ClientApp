"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate, humanizeLabel } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

const FILTER_THRESHOLD = 5;

export type M365RiskyUserRow = {
  id: number;
  user_principal_name: string | null;
  display_name: string | null;
  risk_level: string | null;
  risk_state: string | null;
  risk_last_updated_date_time: string | null;
};

/** Requires IdentityRiskyUser.Read.All, admin-consented on this client's
 * own Azure app registration — not consented anywhere as of when this tab
 * was added. Identity Protection risk signals generally need an Entra ID
 * P2 license on the tenant to populate meaningfully, so an empty list here
 * can mean "not consented", "no P2 license", or genuinely "nobody's
 * flagged" — the sync isolates a 403 from every other M365 section, so
 * there's no separate signal this tab could use to tell those apart. */
export function ClientM365RiskyUsers({
  tenantId,
  users,
}: {
  tenantId: string | null;
  users: M365RiskyUserRow[];
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string | null>(null);

  const levels = Array.from(
    new Set(users.map((u) => u.risk_level).filter((l): l is string => Boolean(l)))
  ).sort();

  const visible = users.filter((u) => {
    if (level && u.risk_level !== level) return false;
    return matchesQuery(query, u.display_name, u.user_principal_name);
  });

  const showFilters = users.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="Risky users" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search users…"
          toggles={levels.map((l) => ({ value: l, label: humanizeLabel(l) }))}
          activeToggle={level}
          onToggle={setLevel}
        />
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            Identity Protection risk data here.
          </p>
        ) : users.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No risky users found. Click &quot;Sync M365&quot; at the top of the page — if it still
            shows nothing, confirm this client&apos;s Azure app registration has
            IdentityRiskyUser.Read.All admin-consented and the tenant has an Entra ID P2 license.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No users match this filter.</p>
        ) : (
          visible.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-5 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {u.display_name ?? u.user_principal_name ?? "Unknown user"}
                </p>
                {u.risk_last_updated_date_time && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Updated {formatDate(u.risk_last_updated_date_time)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {u.risk_state && <Badge value={u.risk_state} label={humanizeLabel(u.risk_state)} />}
                {u.risk_level && <Badge value={u.risk_level} />}
              </div>
            </div>
          ))
        )}
      </div>
    </CollapsibleCard>
  );
}
