import { Badge } from "@/components/badge";
import { formatDate, humanizeLabel } from "@/lib/format";

export type NinjaOneDeviceRow = {
  id: number;
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
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
          devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{d.system_name}</p>
                <p className="text-xs text-slate-500">
                  {d.node_class ? humanizeLabel(d.node_class.toLowerCase()) : "Unknown type"}
                  {d.last_contact ? ` · last seen ${formatDate(d.last_contact)}` : ""}
                </p>
              </div>
              {d.is_offline !== null && <Badge value={d.is_offline ? "offline" : "online"} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
