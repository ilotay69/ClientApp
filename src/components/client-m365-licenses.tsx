"use client";

import { useActionState, useState } from "react";
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

type PurchaseNoteState = { error: string | null };

// Below this, the filter row costs more space than it saves.
const FILTER_THRESHOLD = 5;

/** Purchase channel (direct vs. through a distributor like TD Synnex) isn't
 * exposed by the tenant-scoped Graph API this data is synced through — no
 * Microsoft API call can tell us that, so it's a plain manual note instead. */
function PurchaseNoteField({
  clientId,
  currentNote,
  action,
}: {
  clientId: string;
  currentNote: string | null;
  action: (
    clientId: string,
    prev: PurchaseNoteState,
    formData: FormData
  ) => Promise<PurchaseNoteState>;
}) {
  const [state, formAction, pending] = useActionState<PurchaseNoteState, FormData>(
    action.bind(null, clientId),
    { error: null }
  );

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2 border-b border-slate-100 px-5 py-3">
      <div className="min-w-[16rem] flex-1">
        <label className="block text-xs font-medium text-slate-700">
          Purchased through <span className="font-normal text-slate-400">(manual note)</span>
        </label>
        <input
          type="text"
          name="note"
          defaultValue={currentNote ?? ""}
          placeholder="e.g. Direct from Microsoft, or through TD Synnex"
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function ClientM365Licenses({
  tenantId,
  licenses,
  purchaseNote,
  updatePurchaseNoteAction,
  clientId,
}: {
  tenantId: string | null;
  licenses: M365LicenseRow[];
  purchaseNote: string | null;
  updatePurchaseNoteAction: (
    clientId: string,
    prev: PurchaseNoteState,
    formData: FormData
  ) => Promise<PurchaseNoteState>;
  clientId: string;
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
      <PurchaseNoteField
        clientId={clientId}
        currentNote={purchaseNote}
        action={updatePurchaseNoteAction}
      />
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
              <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-2">
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
