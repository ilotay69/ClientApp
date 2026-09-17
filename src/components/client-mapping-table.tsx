"use client";

import { useMemo, useState } from "react";
import { NinjaOneMappingButton } from "@/components/ninjaone-mapping-button";
import { M365ClientCredentialsButton } from "@/components/m365-client-credentials-button";
import { HuntressMappingButton } from "@/components/huntress-mapping-button";

export type ClientMappingRow = {
  id: string;
  name: string;
  ninjaoneOrganizationId: number | null;
  m365TenantId: string | null;
  hasM365Credentials: boolean;
  m365AppClientId: string | null;
  huntressOrganizationId: number | null;
};

type Filter = "all" | "unmapped" | "no_ninjaone" | "no_m365" | "no_huntress";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unmapped", label: "Missing any" },
  { value: "no_ninjaone", label: "No NinjaOne" },
  { value: "no_m365", label: "No 365" },
  { value: "no_huntress", label: "No Huntress" },
];

function Pill({ mapped, children }: { mapped: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        mapped ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {children}
    </span>
  );
}

/** One row per client, both integrations on the same line — the point of
 * this page is spotting the gaps ("who has no NinjaOne org?"), which was
 * near-impossible when the only place to set a mapping was each client's
 * own page, one at a time.
 *
 * Search and the filter toggles are client-side state rather than URL
 * params: the whole list is already here (a few hundred rows of three
 * short fields), so filtering it in the browser is instant and avoids a
 * server round trip per keystroke. The mapping controls themselves are
 * the exact same popover buttons the client detail page used, with their
 * per-client actions bound by the server component that renders this —
 * no second implementation of the linking logic to keep in step. */
type M365FormState = Awaited<ReturnType<React.ComponentProps<typeof M365ClientCredentialsButton>["saveAction"]>>;

export function ClientMappingTable({
  rows,
  searchNinjaOneAction,
  linkNinjaOneAction,
  unlinkNinjaOneAction,
  saveM365Action,
  testM365Action,
  unlinkM365Action,
  searchHuntressAction,
  linkHuntressAction,
  unlinkHuntressAction,
}: {
  rows: ClientMappingRow[];
  searchNinjaOneAction: React.ComponentProps<typeof NinjaOneMappingButton>["searchAction"];
  // Deliberately the unbound actions, taking clientId as their first
  // argument, with the per-row closures built below. Pre-binding them per
  // client on the server instead would put five encrypted action
  // references per row into the page payload — a few hundred clients in,
  // that's thousands of them, for what a closure does for free here.
  linkNinjaOneAction: (clientId: string, organizationId: number) => Promise<void>;
  unlinkNinjaOneAction: (clientId: string) => Promise<void>;
  saveM365Action: (clientId: string, prevState: M365FormState, formData: FormData) => Promise<M365FormState>;
  testM365Action: (clientId: string) => Promise<{ ok: boolean; message: string }>;
  unlinkM365Action: (clientId: string) => Promise<void>;
  searchHuntressAction: React.ComponentProps<typeof HuntressMappingButton>["searchAction"];
  linkHuntressAction: (clientId: string, organizationId: number) => Promise<void>;
  unlinkHuntressAction: (clientId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      const hasNinja = r.ninjaoneOrganizationId !== null;
      const hasM365 = Boolean(r.m365TenantId);
      const hasHuntress = r.huntressOrganizationId !== null;
      if (filter === "unmapped") return !hasNinja || !hasM365 || !hasHuntress;
      if (filter === "no_ninjaone") return !hasNinja;
      if (filter === "no_m365") return !hasM365;
      if (filter === "no_huntress") return !hasHuntress;
      return true;
    });
  }, [rows, query, filter]);

  const missingNinja = rows.filter((r) => r.ninjaoneOrganizationId === null).length;
  const missingM365 = rows.filter((r) => !r.m365TenantId).length;
  const missingHuntress = rows.filter((r) => r.huntressOrganizationId === null).length;

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Client Mapping</h2>
        <p className="mt-1 text-xs text-slate-500">
          Link each client to their NinjaOne organization and Microsoft 365 tenant. Mapping a client
          here is what makes their Devices, Licenses and Secure Score data start syncing —
          it&apos;s the same link that used to be set from each client&apos;s own page.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {rows.length} client{rows.length === 1 ? "" : "s"} · {missingNinja} without NinjaOne ·{" "}
          {missingM365} without 365 · {missingHuntress} without Huntress
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients…"
          className="w-full sm:w-64 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                filter === f.value ? "bg-brand text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">NinjaOne</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Microsoft 365</th>
                <th className="px-4 py-2 text-left font-medium text-slate-500">Huntress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 align-middle font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      <Pill mapped={r.ninjaoneOrganizationId !== null}>
                        {r.ninjaoneOrganizationId !== null ? `Org ${r.ninjaoneOrganizationId}` : "Not linked"}
                      </Pill>
                      <NinjaOneMappingButton
                        organizationId={r.ninjaoneOrganizationId}
                        searchAction={searchNinjaOneAction}
                        linkAction={(organizationId) => linkNinjaOneAction(r.id, organizationId)}
                        unlinkAction={() => unlinkNinjaOneAction(r.id)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      <Pill mapped={Boolean(r.m365TenantId)}>
                        {r.m365TenantId ? (r.hasM365Credentials ? "Linked" : "Tenant only") : "Not linked"}
                      </Pill>
                      <M365ClientCredentialsButton
                        tenantId={r.m365TenantId}
                        hasCredentials={r.hasM365Credentials}
                        currentAppClientId={r.m365AppClientId}
                        saveAction={(prevState, formData) => saveM365Action(r.id, prevState, formData)}
                        testAction={() => testM365Action(r.id)}
                        unlinkAction={() => unlinkM365Action(r.id)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center gap-2">
                      <Pill mapped={r.huntressOrganizationId !== null}>
                        {r.huntressOrganizationId !== null ? `Org ${r.huntressOrganizationId}` : "Not linked"}
                      </Pill>
                      <HuntressMappingButton
                        organizationId={r.huntressOrganizationId}
                        searchAction={searchHuntressAction}
                        linkAction={(organizationId) => linkHuntressAction(r.id, organizationId)}
                        unlinkAction={() => unlinkHuntressAction(r.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    {rows.length === 0 ? "No clients yet." : "No clients match that filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
