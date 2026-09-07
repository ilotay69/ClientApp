import {
  fetchHuntressOrganizations,
  fetchHuntressAgents,
  fetchHuntressIncidentReportsByStatus,
  type HuntressCredentials,
} from "@/lib/huntress";

export type HuntressAgentAlertRow = {
  agentId: number;
  hostname: string;
  organizationName: string;
  daysSinceCallback: number | null;
  issues: string[];
};

/** Huntress's own confirmed "healthy" example value for defender_status
 * (the field has no fixed enum, just free text, but "Healthy" is what
 * Huntress's own OpenAPI spec shows as the positive case) and firewall_status's
 * confirmed enum (Enabled is the only protected state; Disabled/Pending
 * Isolation/Isolated/Pending Release are all worth surfacing). */
function isDefenderHealthy(status: string | null): boolean {
  return status === null || status.toLowerCase() === "healthy";
}
function isFirewallHealthy(status: string | null): boolean {
  return status === null || status === "Enabled";
}

const OFFLINE_WARN_HOURS = 24;

/** Every agent account-wide with a real health concern: hasn't called
 * home recently, EDR isn't installed, Defender AV isn't healthy, or the
 * firewall isn't enabled — same "surface only the problems" convention as
 * the NinjaOne Offline Devices/Antivirus/Missing Patches lookups. A
 * shorter offline threshold than NinjaOne's RMM devices (24 hours, not
 * 30/90 days) since Huntress's EDR agents check in far more frequently —
 * a day of silence from an actively-monitored endpoint is a real signal,
 * not just a quiet device. */
export async function fetchHuntressAgentAlerts(
  creds: HuntressCredentials,
  organizationId?: number
): Promise<HuntressAgentAlertRow[]> {
  const [orgs, agents] = await Promise.all([
    fetchHuntressOrganizations(creds),
    fetchHuntressAgents(creds, organizationId),
  ]);
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const now = Date.now();

  const rows: HuntressAgentAlertRow[] = [];
  for (const a of agents) {
    const issues: string[] = [];
    let daysSinceCallback: number | null = null;

    if (a.lastCallbackAt) {
      const hoursSince = (now - new Date(a.lastCallbackAt).getTime()) / 3_600_000;
      daysSinceCallback = Math.floor(hoursSince / 24);
      if (hoursSince >= OFFLINE_WARN_HOURS) issues.push(`No check-in for ${daysSinceCallback}d`);
    } else {
      issues.push("Never checked in");
    }
    if (!a.edrVersion) issues.push("EDR not installed");
    if (!isDefenderHealthy(a.defenderStatus)) issues.push(`Defender: ${a.defenderStatus}`);
    if (!isFirewallHealthy(a.firewallStatus)) issues.push(`Firewall: ${a.firewallStatus}`);

    if (issues.length === 0) continue;

    rows.push({
      agentId: a.id,
      hostname: a.hostname,
      organizationName: orgNameById.get(a.organizationId) ?? "Unknown organization",
      daysSinceCallback,
      issues,
    });
  }

  return rows.sort((a, b) => (b.daysSinceCallback ?? Infinity) - (a.daysSinceCallback ?? Infinity));
}

export type HuntressOpenIncidentRow = {
  incidentId: number;
  organizationName: string;
  subject: string;
  severity: string | null;
  status: string;
  sentAt: string | null;
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, low: 2 };

/** Every incident report account-wide that's still actively open — status
 * `sent` (SOC has notified, awaiting action) or `auto_remediating`
 * (Huntress is actively remediating it); `closed`/`dismissed`/
 * `partner_dismissed`/`deleting` are all resolved-or-going-away states,
 * so they're excluded rather than treated as "open." Sorted critical
 * severity first, then newest. */
export async function fetchHuntressOpenIncidents(creds: HuntressCredentials): Promise<HuntressOpenIncidentRow[]> {
  const [orgs, sent, autoRemediating] = await Promise.all([
    fetchHuntressOrganizations(creds),
    fetchHuntressIncidentReportsByStatus(creds, "sent"),
    fetchHuntressIncidentReportsByStatus(creds, "auto_remediating"),
  ]);
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  const rows: HuntressOpenIncidentRow[] = [...sent, ...autoRemediating].map((i) => ({
    incidentId: i.id,
    organizationName: orgNameById.get(i.organizationId) ?? "Unknown organization",
    subject: i.subject,
    severity: i.severity,
    status: i.status,
    sentAt: i.sentAt,
  }));

  return rows.sort((a, b) => {
    const rankA = SEVERITY_RANK[a.severity ?? ""] ?? 3;
    const rankB = SEVERITY_RANK[b.severity ?? ""] ?? 3;
    if (rankA !== rankB) return rankA - rankB;
    return (b.sentAt ?? "").localeCompare(a.sentAt ?? "");
  });
}
