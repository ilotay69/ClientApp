import { differenceInCalendarDays, parseISO } from "date-fns";
import { deviceAgeDays, matchOsEol, isWorkstation, isServer } from "@/lib/device-insights";

type DeviceRow = {
  id: number;
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
  device_created_at: string | null;
  manufacturer_fulfillment_date: string | null;
  os_name: string | null;
  disk_total_bytes: number | null;
  disk_free_bytes: number | null;
  clients: { id: string; name: string } | null;
};

function clientOf(row: DeviceRow): { id: string; name: string } {
  return row.clients ?? { id: "", name: "Unmapped" };
}

const DEVICE_SELECT =
  "id, system_name, node_class, is_offline, last_contact, device_created_at, manufacturer_fulfillment_date, os_name, disk_total_bytes, disk_free_bytes, clients(id, name)";

export type OfflineDeviceRow = {
  id: number;
  clientId: string;
  clientName: string;
  systemName: string;
  nodeClass: string | null;
  daysOffline: number | null;
  lastContact: string | null;
};

/** Every offline device across every client, from the last NinjaOne sync —
 * not a live re-fetch, same "as current as the last sync" posture as the
 * per-client insights this rolls up. Sorted longest-offline first. */
export async function fetchOfflineDevicesAccountWide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<OfflineDeviceRow[]> {
  const { data } = await admin.from("ninjaone_devices").select(DEVICE_SELECT).eq("is_offline", true);

  const now = new Date();
  const rows: OfflineDeviceRow[] = ((data ?? []) as DeviceRow[]).map((d) => {
    const client = clientOf(d);
    return {
      id: d.id,
      clientId: client.id,
      clientName: client.name,
      systemName: d.system_name,
      nodeClass: d.node_class,
      daysOffline: d.last_contact ? differenceInCalendarDays(now, parseISO(d.last_contact)) : null,
      lastContact: d.last_contact,
    };
  });

  return rows.sort((a, b) => (b.daysOffline ?? -1) - (a.daysOffline ?? -1));
}

export type DiskAlertRow = {
  id: number;
  clientId: string;
  clientName: string;
  systemName: string;
  totalBytes: number;
  freeBytes: number;
  percentUsed: number;
};

const DISK_ALERT_THRESHOLD_PERCENT = 90;

/** Every device across every client whose disk usage is over the same 90%
 * threshold the per-client insight already flags — rolled up account-wide
 * so the worst offenders anywhere surface without checking client by
 * client. Sorted fullest first. */
export async function fetchDiskAlertsAccountWide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<DiskAlertRow[]> {
  const { data } = await admin
    .from("ninjaone_devices")
    .select(DEVICE_SELECT)
    .not("disk_total_bytes", "is", null)
    .not("disk_free_bytes", "is", null);

  const rows: DiskAlertRow[] = ((data ?? []) as DeviceRow[])
    .filter((d) => d.disk_total_bytes! > 0)
    .map((d) => {
      const client = clientOf(d);
      const percentUsed = ((d.disk_total_bytes! - d.disk_free_bytes!) / d.disk_total_bytes!) * 100;
      return {
        id: d.id,
        clientId: client.id,
        clientName: client.name,
        systemName: d.system_name,
        totalBytes: d.disk_total_bytes as number,
        freeBytes: d.disk_free_bytes as number,
        percentUsed,
      };
    })
    .filter((r) => r.percentUsed > DISK_ALERT_THRESHOLD_PERCENT);

  return rows.sort((a, b) => b.percentUsed - a.percentUsed);
}

export type AgingHardwareRow = {
  id: number;
  clientId: string;
  clientName: string;
  systemName: string;
  deviceType: "workstation" | "server";
  ageYears: number;
};

export type OsEolRow = {
  id: number;
  clientId: string;
  clientName: string;
  systemName: string;
  osName: string;
  eolLabel: string;
  eolDate: string;
  daysToEol: number;
};

/** Same aging-hardware and OS-EOL checks as the per-client insights
 * (device-insights.ts), rolled up account-wide — every client's hardware
 * refresh/EOL exposure in one place, for planning budgets across the whole
 * book rather than clicking into each client. */
export async function fetchAgingHardwareAccountWide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<AgingHardwareRow[]> {
  const { data } = await admin.from("ninjaone_devices").select(DEVICE_SELECT);
  const now = new Date();

  const WORKSTATION_THRESHOLD_YEARS = 3;
  const SERVER_THRESHOLD_YEARS = 5;

  const rows: AgingHardwareRow[] = [];
  for (const d of (data ?? []) as DeviceRow[]) {
    const ageDays = deviceAgeDays(
      { manufacturer_fulfillment_date: d.manufacturer_fulfillment_date, device_created_at: d.device_created_at },
      now
    );
    if (ageDays === null) continue;
    const ageYears = ageDays / 365;

    let deviceType: "workstation" | "server" | null = null;
    if (isWorkstation(d.node_class) && ageYears >= WORKSTATION_THRESHOLD_YEARS) deviceType = "workstation";
    else if (isServer(d.node_class) && ageYears >= SERVER_THRESHOLD_YEARS) deviceType = "server";
    if (!deviceType) continue;

    const client = clientOf(d);
    rows.push({
      id: d.id,
      clientId: client.id,
      clientName: client.name,
      systemName: d.system_name,
      deviceType,
      ageYears,
    });
  }

  return rows.sort((a, b) => b.ageYears - a.ageYears);
}

export async function fetchOsEolAccountWide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<OsEolRow[]> {
  const { data } = await admin.from("ninjaone_devices").select(DEVICE_SELECT);
  const now = new Date();

  const rows: OsEolRow[] = [];
  for (const d of (data ?? []) as DeviceRow[]) {
    const rule = matchOsEol(d.os_name);
    if (!rule) continue;
    const client = clientOf(d);
    rows.push({
      id: d.id,
      clientId: client.id,
      clientName: client.name,
      systemName: d.system_name,
      osName: d.os_name as string,
      eolLabel: rule.label,
      eolDate: rule.eol,
      daysToEol: differenceInCalendarDays(parseISO(rule.eol), now),
    });
  }

  return rows.sort((a, b) => a.daysToEol - b.daysToEol);
}
