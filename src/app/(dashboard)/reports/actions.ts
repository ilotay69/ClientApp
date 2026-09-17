"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { getBitdefenderSettings } from "@/lib/bitdefender-settings";
import { getWizerSettings } from "@/lib/wizer-settings";
import { getNinjaOneSettings, getValidNinjaOneToken } from "@/lib/ninjaone-settings";
import { getHuntressSettings } from "@/lib/huntress-settings";
import type { ForticloudCredentials } from "@/lib/forticloud";
import {
  buildClientRosterReport,
  buildDeviceInventoryReport,
  buildOpenTicketsReport,
  buildHoursSummaryReport,
  buildForticloudDevicesReport,
  buildBitdefenderEndpointsReport,
  buildWizerMetricsReport,
  buildResourceHoursReport,
  buildYesterdayTimeEntriesReport,
  buildContractBlockHoursReport,
  buildAgingTicketsReport,
  buildOfflineDevicesReport,
  buildDiskAlertsReport,
  buildAgingHardwareReport,
  buildOsEolReport,
  buildAntivirusAlertsReport,
  buildMissingPatchesReport,
  buildSecureScoreRollupReport,
  buildLicenseUtilizationRollupReport,
  buildMfaGapsRollupReport,
  buildInactiveAccountsRollupReport,
  buildPrivilegedRolesRollupReport,
  buildMailboxUsageRollupReport,
  buildHuntressAgentAlertsReport,
  buildHuntressOpenIncidentsReport,
  type ReportCell,
  type ReportData,
} from "@/lib/reports";

export type ReportKey =
  | "clients"
  | "devices"
  | "tickets"
  | "hours"
  | "forticloud"
  | "bitdefender_endpoints"
  | "wizer_metrics"
  | "resource_hours"
  | "yesterday_entries"
  | "block_hours"
  | "aging_tickets"
  | "offline_devices"
  | "disk_alerts"
  | "aging_hardware"
  | "os_eol"
  | "antivirus_alerts"
  | "missing_patches"
  | "secure_score_rollup"
  | "license_utilization"
  | "mfa_gaps"
  | "inactive_accounts"
  | "privileged_roles"
  | "mailbox_usage_rollup"
  | "huntress_agent_alerts"
  | "huntress_open_incidents";

export type ReportPreview = {
  headers: string[];
  rows: ReportCell[][];
  totalRows: number;
  truncated: boolean;
  /** Per-client fetch failures for a rollup that spans every client's own
   * M365 credentials — surfaced in the preview only, never in the CSV
   * download, so one client's expired token doesn't hide from staff without
   * blocking everyone else's rows. See src/lib/reports.ts. */
  warnings?: string[];
};

const PREVIEW_LIMIT = 50;

/** Forces a compile error if a switch over ReportKey ever leaves a key
 * unhandled — `key` can only narrow to `never` here if every other case
 * already claimed its literal. Without this, an unhandled key at runtime
 * would leave `data` undefined and crash on `data.headers` below instead
 * of failing at build time when the key was added. */
function assertUnreachable(key: never): never {
  throw new Error(`Unhandled report key: ${key}`);
}

/** "Autotask isn't connected" is the same guard for every Autotask-backed
 * report below — pulled out so each case is one line instead of repeating
 * the same three. Returns null (and the caller should bail) when it's not
 * set up. */
async function requireAutotaskSettings(admin: ReturnType<typeof createAdminClient>) {
  const settings = await getAutotaskSettings(admin);
  // Rebuilt as a new object literal (not `return settings`) so TypeScript
  // narrows `zoneUrl` to `string` for every caller — returning the original
  // `settings` reference keeps its declared `string | null` type even though
  // the truthy check above already ruled out null at this exact spot.
  if (!settings?.zoneUrl) return null;
  return { ...settings, zoneUrl: settings.zoneUrl };
}

/** Same query/column logic each CSV download route uses (see
 * src/lib/reports.ts) — capped to a preview window so a large export
 * doesn't mean rendering thousands of table rows just to look at it
 * before deciding to download.
 *
 * A switch, not if/else-if — with this many report keys now (and more
 * being added over several stages), a chain ending in a bare `else` would
 * silently misroute the moment a key was added without an explicit branch.
 * Each case is required to return or fall through to the shared handling
 * below; TypeScript flags an unhandled ReportKey as a type error here. */
export async function getReportPreviewAction(key: ReportKey): Promise<ReportPreview | { error: string }> {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return { error: "You don't have permission to do that." };
  }

  try {
    let data: ReportData;
    switch (key) {
      case "clients":
        data = await buildClientRosterReport(supabase);
        break;
      case "devices":
        data = await buildDeviceInventoryReport(supabase);
        break;
      case "tickets":
        data = await buildOpenTicketsReport(supabase);
        break;
      case "hours": {
        const admin = createAdminClient();
        const settings = await requireAutotaskSettings(admin);
        if (!settings) return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
        data = await buildHoursSummaryReport(admin, settings.credentials, settings.zoneUrl);
        break;
      }
      case "resource_hours": {
        const admin = createAdminClient();
        const settings = await requireAutotaskSettings(admin);
        if (!settings) return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
        data = await buildResourceHoursReport(settings.credentials, settings.zoneUrl);
        break;
      }
      case "yesterday_entries": {
        const admin = createAdminClient();
        const settings = await requireAutotaskSettings(admin);
        if (!settings) return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
        data = await buildYesterdayTimeEntriesReport(admin, settings.credentials, settings.zoneUrl);
        break;
      }
      case "block_hours": {
        const admin = createAdminClient();
        const settings = await requireAutotaskSettings(admin);
        if (!settings) return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
        data = await buildContractBlockHoursReport(admin, settings.credentials, settings.zoneUrl);
        break;
      }
      case "aging_tickets": {
        const admin = createAdminClient();
        const settings = await requireAutotaskSettings(admin);
        if (!settings) return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
        data = await buildAgingTicketsReport(admin, settings.credentials, settings.zoneUrl);
        break;
      }
      case "offline_devices":
        data = await buildOfflineDevicesReport(createAdminClient());
        break;
      case "disk_alerts":
        data = await buildDiskAlertsReport(createAdminClient());
        break;
      case "aging_hardware":
        data = await buildAgingHardwareReport(createAdminClient());
        break;
      case "os_eol":
        data = await buildOsEolReport(createAdminClient());
        break;
      case "antivirus_alerts": {
        const admin = createAdminClient();
        const settings = await getNinjaOneSettings(admin);
        if (!settings) return { error: "NinjaOne isn't connected yet — set it up under Settings → Integrations." };
        const token = await getValidNinjaOneToken(admin, settings);
        data = await buildAntivirusAlertsReport(admin, settings.credentials, token);
        break;
      }
      case "missing_patches": {
        const admin = createAdminClient();
        const settings = await getNinjaOneSettings(admin);
        if (!settings) return { error: "NinjaOne isn't connected yet — set it up under Settings → Integrations." };
        const token = await getValidNinjaOneToken(admin, settings);
        data = await buildMissingPatchesReport(admin, settings.credentials, token);
        break;
      }
      case "forticloud": {
        const admin = createAdminClient();
        const { data: rows } = await admin.from("forticloud_accounts").select("label, api_user, api_password");
        if (!rows || rows.length === 0) {
          return { error: "No FortiCloud accounts configured yet — add one under Settings → Integrations." };
        }
        const accounts = rows.map((r: { label: string; api_user: string; api_password: string }) => ({
          label: r.label,
          creds: { apiUser: r.api_user, apiPassword: r.api_password } satisfies ForticloudCredentials,
        }));
        data = await buildForticloudDevicesReport(accounts);
        break;
      }
      case "bitdefender_endpoints": {
        const admin = createAdminClient();
        const settings = await getBitdefenderSettings(admin);
        if (!settings) {
          return { error: "Bitdefender GravityZone isn't connected yet — set it up under Settings → Integrations." };
        }
        data = await buildBitdefenderEndpointsReport(settings);
        break;
      }
      case "wizer_metrics": {
        const admin = createAdminClient();
        const settings = await getWizerSettings(admin);
        if (!settings) return { error: "Wizer isn't connected yet — set it up under Settings → Integrations." };
        data = await buildWizerMetricsReport(settings);
        break;
      }
      case "secure_score_rollup":
        data = await buildSecureScoreRollupReport(createAdminClient());
        break;
      case "license_utilization":
        data = await buildLicenseUtilizationRollupReport(createAdminClient());
        break;
      case "mfa_gaps":
        data = await buildMfaGapsRollupReport(createAdminClient());
        break;
      case "inactive_accounts":
        data = await buildInactiveAccountsRollupReport(createAdminClient());
        break;
      case "privileged_roles":
        data = await buildPrivilegedRolesRollupReport(createAdminClient());
        break;
      case "mailbox_usage_rollup":
        data = await buildMailboxUsageRollupReport(createAdminClient());
        break;
      case "huntress_agent_alerts": {
        const admin = createAdminClient();
        const settings = await getHuntressSettings(admin);
        if (!settings) return { error: "Huntress isn't connected yet — set it up under Settings → Integrations." };
        data = await buildHuntressAgentAlertsReport(settings);
        break;
      }
      case "huntress_open_incidents": {
        const admin = createAdminClient();
        const settings = await getHuntressSettings(admin);
        if (!settings) return { error: "Huntress isn't connected yet — set it up under Settings → Integrations." };
        data = await buildHuntressOpenIncidentsReport(settings);
        break;
      }
      default:
        return assertUnreachable(key);
    }

    return {
      headers: data.headers,
      rows: data.rows.slice(0, PREVIEW_LIMIT),
      totalRows: data.rows.length,
      truncated: data.rows.length > PREVIEW_LIMIT,
      warnings: data.warnings,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load report." };
  }
}
