"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { friendlyM365SkuName } from "@/lib/m365-sku-names";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";

export type M365LicenseRow = {
  id: number;
  sku_part_number: string;
  consumed_units: number;
  enabled_units: number;
};

// Below this, the filter row costs more space than it saves.
const FILTER_THRESHOLD = 5;

export function ClientM365Licenses({
  tenantId,
  licenses,
}: {
  tenantId: string | null;
  licenses: M365LicenseRow[];
}) {
  const [query, setQuery] = useState("");
  const [toggle, setToggle] = useState<string | null>(null);

  const atCapacity = (l: M365LicenseRow) => l.consumed_units >= l.enabled_units;

  const visible = licenses.filter((l) => {
    if (toggle === "capacity" && !atCapacity(l)) return false;
    if (toggle === "unused" && l.consumed_units > 0) return false;
    // Searchable by both the friendly name and the raw SKU code, since either
    // is a reasonable thing to type.
    return matchesQuery(query, friendlyM365SkuName(l.sku_part_number), l.sku_part_number);
  });

  const showFilters = licenses.length > FILTER_THRESHOLD;

  return (
    <CollapsibleCard title="Microsoft 365 licenses" count={visible.length}>
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search licenses…"
          toggles={[
            { value: "capacity", label: "At capacity" },
            { value: "unused", label: "Unused" },
          ]}
          activeToggle={toggle}
          onToggle={setToggle}
        />
      )}
      <div className="divide-y divide-slate-100">
        {tenantId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to Microsoft 365 using the button at the top of the page to see its
            license usage here.
          </p>
        ) : licenses.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No license data found — click &quot;Sync M365&quot; at the top of the page.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No licenses match this filter.</p>
        ) : (
          visible.map((l) => {
            const noHeadroom = atCapacity(l);
            return (
              <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <p className="text-sm font-medium text-slate-900">
                  {friendlyM365SkuName(l.sku_part_number)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {l.consumed_units} / {l.enabled_units} used
                  </span>
                  {noHeadroom && <Badge value="high" />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </CollapsibleCard>
  );
}
