"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate, humanizeLabel } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { ListFilterBar, matchesQuery } from "@/components/list-filter-bar";
import { buildDeviceInsights } from "@/lib/device-insights";

/** Collapses NinjaOne's many nodeClass values down to the one distinction
 * that matters at a glance — Server vs. Workstation vs. Network device —
 * rather than the raw enum ("Windows Server" vs "Linux Server" etc). */
function deviceTypeLabel(nodeClass: string | null): string {
  if (!nodeClass) return "Unknown type";
  if (nodeClass.includes("SERVER") || nodeClass === "VMWARE_VM_HOST") return "server";
  if (nodeClass.includes("WORKSTATION") || nodeClass === "MAC") return "workstation";
  if (nodeClass.startsWith("NMS_") || nodeClass.includes("VM_GUEST")) return "network_device";
  return nodeClass;
}

export type NinjaOneDeviceRow = {
  id: number;
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
  device_created_at: string | null;
  os_name: string | null;
  os_version: string | null;
  manufacturer: string | null;
  model: string | null;
  last_logged_on_user: string | null;
};

const FILTER_THRESHOLD = 5;

export function ClientNinjaOneDevices({
  organizationId,
  devices,
}: {
  organizationId: number | null;
  devices: NinjaOneDeviceRow[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  // Type chips are limited to the types actually present, so a client with no
  // servers doesn't get a chip that can only ever return nothing.
  const presentTypes = Array.from(
    new Set(devices.map((d) => deviceTypeLabel(d.node_class)))
  ).filter((t) => ["server", "workstation", "network_device"].includes(t));

  const visible = devices.filter((d) => {
    if (filter === "offline" && !d.is_offline) return false;
    if (filter === "online" && d.is_offline) return false;
    if (
      filter &&
      filter !== "offline" &&
      filter !== "online" &&
      deviceTypeLabel(d.node_class) !== filter
    ) {
      return false;
    }
    return matchesQuery(
      query,
      d.system_name,
      d.os_name,
      d.manufacturer,
      d.model,
      d.last_logged_on_user
    );
  });

  const showFilters = devices.length > FILTER_THRESHOLD;
  const insights = buildDeviceInsights(devices);
  const highCount = insights.filter((i) => i.severity === "high").length;

  return (
    <CollapsibleCard
      title="Devices (NinjaOne)"
      count={visible.length}
      headerRight={
        insights.length > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              highCount > 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
            }`}
          >
            {insights.length} issue{insights.length === 1 ? "" : "s"}
          </span>
        )
      }
    >
      {insights.length > 0 && (
        <div className="space-y-2 border-b border-slate-100 bg-amber-50/40 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Needs attention
          </p>
          {insights.map((i, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  i.severity === "high" ? "bg-red-500" : "bg-amber-500"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  <span className="sr-only">
                    {i.severity === "high" ? "High severity: " : "Medium severity: "}
                  </span>
                  {i.title}
                </p>
                <p className="text-xs text-slate-600">{i.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {showFilters && (
        <ListFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search devices…"
          toggles={[
            { value: "offline", label: "Offline" },
            { value: "online", label: "Online" },
            ...presentTypes.map((t) => ({ value: t, label: humanizeLabel(t) })),
          ]}
          activeToggle={filter}
          onToggle={setFilter}
        />
      )}
      <div className="divide-y divide-slate-100">
        {organizationId === null ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            Link this client to NinjaOne using the button at the top of the page to see its
            devices here.
          </p>
        ) : devices.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">
            No devices found — click &quot;Sync NinjaOne&quot; at the top of the page.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No devices match this filter.</p>
        ) : (
          visible.map((d) => <DeviceRow key={d.id} device={d} />)
        )}
      </div>
    </CollapsibleCard>
  );
}

function DeviceRow({ device: d }: { device: NinjaOneDeviceRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(
    d.os_name || d.os_version || d.manufacturer || d.model || d.last_logged_on_user || d.device_created_at
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{d.system_name}</p>
          <p className="text-xs text-slate-500">
            {[d.os_name, d.os_version].filter(Boolean).join(" ") || "OS unknown"}
            {d.last_contact ? ` · last seen ${formatDate(d.last_contact)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge value={deviceTypeLabel(d.node_class)} />
          {d.is_offline !== null && <Badge value={d.is_offline ? "offline" : "online"} />}
        </div>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm sm:grid-cols-3">
          <Detail label="Operating system" value={[d.os_name, d.os_version].filter(Boolean).join(" ")} />
          <Detail
            label="Device class"
            value={d.node_class ? humanizeLabel(d.node_class.toLowerCase()) : null}
          />
          <Detail label="Manufacturer" value={d.manufacturer} />
          <Detail label="Model" value={d.model} />
          <Detail label="Last logged-on user" value={d.last_logged_on_user} />
          <Detail label="Last contact" value={d.last_contact ? formatDate(d.last_contact) : null} />
          <Detail
            label="First registered"
            value={d.device_created_at ? formatDate(d.device_created_at) : null}
          />
          {!hasDetail && (
            <p className="col-span-full text-slate-500">
              No additional detail available for this device yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-700">{value}</p>
    </div>
  );
}
