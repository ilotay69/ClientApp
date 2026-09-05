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
const WORKSTATION_AGE_THRESHOLD_DAYS = 3 * 365;
const SERVER_AGE_THRESHOLD_DAYS = 5 * 365;

/** Device age in days — prefers NinjaOne's auto-detected manufacturer
 * fulfillment date (the actual hardware ship date, via warranty lookup)
 * over when NinjaOne first registered the device (enrollment date, not
 * purchase date), since fulfillment data isn't available for every
 * device (unsupported vendor, or the lookup never ran). Shared by the
 * aging-hardware insight below and the Devices list's own age display so
 * both agree on the same number. */
export function deviceAgeDays(
  d: Pick<DeviceInsightInput, "manufacturer_fulfillment_date" | "device_created_at">,
  now: Date = new Date()
): number | null {
  const source = d.manufacturer_fulfillment_date ?? d.device_created_at;
  return source ? differenceInCalendarDays(now, parseISO(source)) : null;
}

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

  // --- Hardware older than its typical refresh cycle. Workstations/laptops
  // and servers are checked separately against their own thresholds below —
  // network gear isn't checked, it's refreshed on a different cycle again. ---
  function pushAgingInsight(
    label: string,
    classify: (nodeClass: string | null) => boolean,
    thresholdDays: number
  ) {
    const aging = devices.filter((d) => {
      if (!classify(d.node_class)) return false;
      const days = deviceAgeDays(d, now);
      return days !== null && days >= thresholdDays;
    });
    if (aging.length === 0) return;

    const years = thresholdDays / 365;
    insights.push({
      severity: "medium",
      title: `${aging.length} ${label}${aging.length === 1 ? "" : "s"} older than ${years} years`,
      detail: nameList(
        aging
          .sort((a, b) => (deviceAgeDays(b, now) ?? 0) - (deviceAgeDays(a, now) ?? 0))
          .map((d) => `${d.system_name} (${((deviceAgeDays(d, now) ?? 0) / 365).toFixed(1)}y)`)
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

export type AgeBucket = { label: string; count: number };
export type DeviceAgeBreakdown = { label: string; buckets: AgeBucket[]; unknownCount: number };

/** One-year buckets from 0 up to (not including) maxYears, plus a final
 * overflow bucket for maxYears+ — e.g. maxYears=3 gives <1y/1-2y/2-3y/3y+. */
function buildAgeBuckets(list: DeviceInsightInput[], maxYears: number, now: Date): AgeBucket[] {
  const ages = list
    .map((d) => deviceAgeDays(d, now))
    .filter((days): days is number => days !== null)
    .map((days) => days / 365);

  const buckets: AgeBucket[] = [];
  for (let y = 0; y < maxYears; y++) {
    buckets.push({
      label: y === 0 ? "<1y" : `${y}-${y + 1}y`,
      count: ages.filter((a) => a >= y && a < y + 1).length,
    });
  }
  buckets.push({ label: `${maxYears}y+`, count: ages.filter((a) => a >= maxYears).length });
  return buckets;
}

/** Age distribution for workstations and servers, each bucketed in
 * 1-year increments up to that class's own aging threshold above (3
 * years for workstations, 5 for servers) — purely informational, so kept
 * separate from buildDeviceInsights' actionable warning list. A class
 * with no devices (or no ages known for any of them) is omitted rather
 * than shown as all-zero. */
export function buildDeviceAgeBreakdown(
  devices: DeviceInsightInput[],
  now: Date = new Date()
): DeviceAgeBreakdown[] {
  const classes: { label: string; classify: (nodeClass: string | null) => boolean; maxYears: number }[] = [
    { label: "Workstations", classify: isWorkstation, maxYears: 3 },
    { label: "Servers", classify: isServer, maxYears: 5 },
  ];

  return classes
    .map(({ label, classify, maxYears }) => {
      const list = devices.filter((d) => classify(d.node_class));
      return {
        label,
        buckets: buildAgeBuckets(list, maxYears, now),
        unknownCount: list.filter((d) => deviceAgeDays(d, now) === null).length,
      };
    })
    .filter((entry) => entry.buckets.reduce((sum, b) => sum + b.count, 0) + entry.unknownCount > 0);
}
