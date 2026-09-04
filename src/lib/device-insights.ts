import { differenceInCalendarDays, parseISO, format } from "date-fns";

// Deterministic health checks over a client's NinjaOne device list — the
// "what doesn't look right here" pass you'd otherwise do by eye. Kept as pure
// functions with no AI involved: an EOL date is a fact, and a device offline
// for 200 days is arithmetic, so neither should depend on a model call.
//
// EOL dates below are verified against endoflife.date (which tracks
// Microsoft's and Apple's published lifecycle data) — not recalled. Re-check
// them when adding a new OS.

type OsEolRule = {
  /** Matched against NinjaOne's os_name, e.g. "Microsoft Windows Server 2019 Standard". */
  match: RegExp;
  label: string;
  eol: string;
};

// Server rules come first: "Windows Server 2012" must not fall through to a
// looser client rule.
const OS_EOL_RULES: OsEolRule[] = [
  { match: /server\s*2003/i, label: "Windows Server 2003", eol: "2015-07-14" },
  { match: /server\s*2008/i, label: "Windows Server 2008", eol: "2020-01-14" },
  { match: /server\s*2012/i, label: "Windows Server 2012", eol: "2023-10-10" },
  { match: /server\s*2016/i, label: "Windows Server 2016", eol: "2027-01-12" },
  { match: /server\s*2019/i, label: "Windows Server 2019", eol: "2029-01-09" },
  { match: /server\s*2022/i, label: "Windows Server 2022", eol: "2031-10-14" },
  { match: /server\s*2025/i, label: "Windows Server 2025", eol: "2034-11-14" },

  { match: /windows\s*(xp|vista)/i, label: "Windows XP/Vista", eol: "2017-04-11" },
  { match: /windows\s*7/i, label: "Windows 7", eol: "2020-01-14" },
  { match: /windows\s*8/i, label: "Windows 8 / 8.1", eol: "2023-01-10" },
  { match: /windows\s*10/i, label: "Windows 10", eol: "2025-10-14" },
  // Deliberately no Windows 11 rule: its dated deadlines are per-feature-update
  // (23H2, 24H2…), not the end of the product, and NinjaOne's os_name usually
  // doesn't carry the feature-update version — so a rule here would flag
  // current, fully-supported machines.

  { match: /sierra/i, label: "macOS Sierra/High Sierra", eol: "2020-12-01" },
  { match: /mojave/i, label: "macOS Mojave", eol: "2021-10-25" },
  { match: /catalina/i, label: "macOS Catalina", eol: "2026-02-02" },
  { match: /big\s*sur/i, label: "macOS Big Sur", eol: "2026-02-02" },
  { match: /monterey/i, label: "macOS Monterey", eol: "2024-09-16" },
  { match: /ventura/i, label: "macOS Ventura", eol: "2025-09-15" },
];

/** LTSC/IoT builds run on a much longer lifecycle than the mainstream release
 * of the same version, so flagging them off the consumer date would be wrong. */
function isLongTermServicing(osName: string) {
  return /ltsc|ltsb|\biot\b/i.test(osName);
}

export function matchOsEol(osName: string | null): OsEolRule | null {
  if (!osName || isLongTermServicing(osName)) return null;
  return OS_EOL_RULES.find((r) => r.match.test(osName)) ?? null;
}

export type DeviceInsightInput = {
  system_name: string;
  node_class: string | null;
  is_offline: boolean | null;
  last_contact: string | null;
  device_created_at: string | null;
  manufacturer_fulfillment_date: string | null;
  os_name: string | null;
};

// Same workstation/server classification as the Devices tab's own
// deviceTypeLabel — each class ages on its own refresh cycle, so an age
// check only makes sense within one class, not across all hardware.
function isWorkstation(nodeClass: string | null): boolean {
  if (!nodeClass) return false;
  return nodeClass.includes("WORKSTATION") || nodeClass === "MAC";
}
function isServer(nodeClass: string | null): boolean {
  if (!nodeClass) return false;
  return nodeClass.includes("SERVER") || nodeClass === "VMWARE_VM_HOST";
}

export type DeviceInsight = {
  severity: "high" | "medium";
  title: string;
  detail: string;
};

const OFFLINE_URGENT_DAYS = 90;
const OFFLINE_WARN_DAYS = 30;
/** How far ahead an upcoming EOL is worth surfacing — roughly a budget cycle. */
const EOL_SOON_DAYS = 180;
/** Typical hardware refresh cycle for a workstation/laptop. */
const WORKSTATION_AGE_THRESHOLD_DAYS = 3 * 365;
/** Servers are typically kept in service longer than end-user hardware. */
const SERVER_AGE_THRESHOLD_DAYS = 5 * 365;

/** Names are truncated in the detail line; the full list is a filter click away. */
function nameList(names: string[], max = 4) {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

export function buildDeviceInsights(
  devices: DeviceInsightInput[],
  now: Date = new Date()
): DeviceInsight[] {
  const insights: DeviceInsight[] = [];

  // --- Offline for a long time ---
  const offlineDays = (d: DeviceInsightInput) =>
    d.last_contact ? differenceInCalendarDays(now, parseISO(d.last_contact)) : null;

  const longOffline = devices.filter((d) => {
    if (!d.is_offline) return false;
    const days = offlineDays(d);
    return days !== null && days >= OFFLINE_URGENT_DAYS;
  });
  if (longOffline.length > 0) {
    insights.push({
      severity: "high",
      title: `${longOffline.length} device${longOffline.length === 1 ? "" : "s"} offline for ${OFFLINE_URGENT_DAYS}+ days`,
      detail: nameList(
        longOffline
          .sort((a, b) => (offlineDays(b) ?? 0) - (offlineDays(a) ?? 0))
          .map((d) => `${d.system_name} (${offlineDays(d)}d)`)
      ),
    });
  }

  const recentlyOffline = devices.filter((d) => {
    if (!d.is_offline) return false;
    const days = offlineDays(d);
    return days !== null && days >= OFFLINE_WARN_DAYS && days < OFFLINE_URGENT_DAYS;
  });
  if (recentlyOffline.length > 0) {
    insights.push({
      severity: "medium",
      title: `${recentlyOffline.length} device${recentlyOffline.length === 1 ? "" : "s"} offline for ${OFFLINE_WARN_DAYS}+ days`,
      detail: nameList(recentlyOffline.map((d) => `${d.system_name} (${offlineDays(d)}d)`)),
    });
  }

  // --- Devices that have never reported in ---
  const neverSeen = devices.filter((d) => !d.last_contact);
  if (neverSeen.length > 0) {
    insights.push({
      severity: "medium",
      title: `${neverSeen.length} device${neverSeen.length === 1 ? "" : "s"} with no recorded contact`,
      detail: nameList(neverSeen.map((d) => d.system_name)),
    });
  }

  // --- Hardware older than its typical refresh cycle. Prefers NinjaOne's
  // auto-detected manufacturer fulfillment date (the actual hardware ship
  // date, via warranty lookup) — a real proxy for device age. Falls back to
  // when NinjaOne first registered the device (enrollment date, not
  // purchase date) when fulfillment data isn't available for that device
  // (unsupported vendor, or the lookup never ran). Workstations/laptops and
  // servers are checked separately against their own thresholds below —
  // network gear isn't checked, it's refreshed on a different cycle again. ---
  const ageDays = (d: DeviceInsightInput) => {
    const source = d.manufacturer_fulfillment_date ?? d.device_created_at;
    return source ? differenceInCalendarDays(now, parseISO(source)) : null;
  };

  function pushAgingInsight(
    label: string,
    classify: (nodeClass: string | null) => boolean,
    thresholdDays: number
  ) {
    const aging = devices.filter((d) => {
      if (!classify(d.node_class)) return false;
      const days = ageDays(d);
      return days !== null && days >= thresholdDays;
    });
    if (aging.length === 0) return;

    const years = thresholdDays / 365;
    insights.push({
      severity: "medium",
      title: `${aging.length} ${label}${aging.length === 1 ? "" : "s"} older than ${years} years`,
      detail: nameList(
        aging
          .sort((a, b) => (ageDays(b) ?? 0) - (ageDays(a) ?? 0))
          .map((d) => `${d.system_name} (${((ageDays(d) ?? 0) / 365).toFixed(1)}y)`)
      ),
    });
  }

  pushAgingInsight("workstation", isWorkstation, WORKSTATION_AGE_THRESHOLD_DAYS);
  pushAgingInsight("server", isServer, SERVER_AGE_THRESHOLD_DAYS);

  // --- Operating systems past (or nearing) end of life ---
  const byOs = new Map<string, { rule: OsEolRule; names: string[] }>();
  for (const d of devices) {
    const rule = matchOsEol(d.os_name);
    if (!rule) continue;
    const entry = byOs.get(rule.label) ?? { rule, names: [] };
    entry.names.push(d.system_name);
    byOs.set(rule.label, entry);
  }

  for (const { rule, names } of byOs.values()) {
    const daysToEol = differenceInCalendarDays(parseISO(rule.eol), now);
    const when = format(parseISO(rule.eol), "d MMM yyyy");

    if (daysToEol < 0) {
      insights.push({
        severity: "high",
        title: `${names.length} device${names.length === 1 ? "" : "s"} on ${rule.label} — end of life since ${when}`,
        detail: `No further security updates. ${nameList(names)}`,
      });
    } else if (daysToEol <= EOL_SOON_DAYS) {
      insights.push({
        severity: "medium",
        title: `${names.length} device${names.length === 1 ? "" : "s"} on ${rule.label} — end of life ${when}`,
        detail: `Support ends in ${daysToEol} days. ${nameList(names)}`,
      });
    }
  }

  // High severity first, so the worst thing is the first thing read.
  return insights.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
