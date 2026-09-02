"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate, humanizeLabel } from "@/lib/format";

export type NinjaOneDeviceRow = {
  id: number;
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
  os_name: string | null;
  os_version: string | null;
  manufacturer: string | null;
  model: string | null;
  last_logged_on_user: string | null;
};

export function ClientNinjaOneDevices({
  organizationId,
  devices,
}: {
  organizationId: number | null;
  devices: NinjaOneDeviceRow[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Devices (NinjaOne)</h2>
      </div>
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
        ) : (
          devices.map((d) => <DeviceRow key={d.id} device={d} />)
        )}
      </div>
    </div>
  );
}

function DeviceRow({ device: d }: { device: NinjaOneDeviceRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(d.os_name || d.os_version || d.manufacturer || d.model || d.last_logged_on_user);

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
            {d.node_class ? humanizeLabel(d.node_class.toLowerCase()) : "Unknown type"}
            {d.os_name ? ` · ${d.os_name}` : ""}
            {d.last_contact ? ` · last seen ${formatDate(d.last_contact)}` : ""}
          </p>
        </div>
        {d.is_offline !== null && <Badge value={d.is_offline ? "offline" : "online"} />}
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm sm:grid-cols-3">
          <Detail label="Operating system" value={[d.os_name, d.os_version].filter(Boolean).join(" ")} />
          <Detail label="Manufacturer" value={d.manufacturer} />
          <Detail label="Model" value={d.model} />
          <Detail label="Last logged-on user" value={d.last_logged_on_user} />
          <Detail label="Last contact" value={d.last_contact ? formatDate(d.last_contact) : null} />
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
