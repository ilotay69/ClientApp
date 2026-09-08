import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ResourceHoursReport } from "@/components/resource-hours-report";
import { YesterdayTimeEntries } from "@/components/yesterday-time-entries";
import { HoursLookup } from "@/components/hours-lookup";
import { ContractBlockHours } from "@/components/contract-block-hours";
import { AgingOpenTickets } from "@/components/aging-open-tickets";
import { OfflineDevicesLookup } from "@/components/offline-devices-lookup";
import { DiskAlertsLookup } from "@/components/disk-alerts-lookup";
import { HardwareLifecycleLookup } from "@/components/hardware-lifecycle-lookup";
import { AntivirusAlertsLookup } from "@/components/antivirus-alerts-lookup";
import { MissingPatchesLookup } from "@/components/missing-patches-lookup";
import { SecureScoreRollup } from "@/components/secure-score-rollup";
import { LicenseUtilizationRollup } from "@/components/license-utilization-rollup";
import { MfaGapsRollup } from "@/components/mfa-gaps-rollup";
import { InactiveAccountsRollup } from "@/components/inactive-accounts-rollup";
import { PrivilegedRolesRollup } from "@/components/privileged-roles-rollup";
import { MailboxUsageRollup } from "@/components/mailbox-usage-rollup";
import { HuntressAgentAlerts } from "@/components/huntress-agent-alerts";
import { HuntressOpenIncidents } from "@/components/huntress-open-incidents";
import { HuntressSiemLogs } from "@/components/huntress-siem-logs";
import { BitdefenderEndpoints } from "@/components/bitdefender-endpoints";
import { BitdefenderOpenIncidents } from "@/components/bitdefender-open-incidents";
import { ForticloudDevices } from "@/components/forticloud-devices";
import { WizerTrainingMetrics } from "@/components/wizer-training-metrics";
import { GroupedTabs } from "@/components/grouped-tabs";
import {
  fetchResourceHoursAction,
  fetchYesterdayTimeEntriesAction,
  fetchHoursByGroupAction,
  fetchNonBillableHoursByGroupAction,
  fetchContractBlockHoursAction,
  fetchAgingOpenTicketsAction,
} from "./actions";
import {
  fetchOfflineDevicesAction,
  fetchDiskAlertsAction,
  fetchAgingHardwareAction,
  fetchOsEolAction,
  fetchAntivirusAlertsAction,
  fetchMissingPatchesAction,
} from "./ninjaone-actions";
import {
  fetchSecureScoreRollupAction,
  fetchLicenseUtilizationRollupAction,
  fetchMfaGapsRollupAction,
  fetchInactiveAccountsRollupAction,
  fetchPrivilegedRolesRollupAction,
  fetchMailboxUsageRollupAction,
} from "./m365-actions";
import {
  fetchHuntressAgentAlertsAction,
  fetchHuntressOpenIncidentsAction,
  fetchHuntressSiemLogsAction,
} from "./huntress-actions";
import { fetchGravityZoneEndpointsAction, fetchGravityZoneOpenIncidentsAction } from "./bitdefender-actions";
import { fetchForticloudDevicesAction } from "./forticloud-actions";
import { fetchWizerCompanyMetricsAction } from "./wizer-actions";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_lookups"))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lookups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Time logged in Autotask, by resource — today, yesterday, this week, and this month.
        </p>
      </div>

      <GroupedTabs
        groups={[
          {
            group: "Autotask",
            tabs: [
              {
                label: "Resource Hours",
                content: (
                  <div className="space-y-6">
                    <ResourceHoursReport action={fetchResourceHoursAction} />
                    <HoursLookup key="by-client-or-resource" action={fetchHoursByGroupAction} />
                  </div>
                ),
              },
              {
                label: "Yesterday's Entries",
                content: <YesterdayTimeEntries action={fetchYesterdayTimeEntriesAction} />,
              },
              {
                label: "Non-Billable Hours",
                content: (
                  <HoursLookup
                    key="non-billable"
                    action={fetchNonBillableHoursByGroupAction}
                    title="Non-billable hours by client or resource"
                    subtitle="Hours logged as non-billable in Autotask over a range you pick — live, nothing stored."
                  />
                ),
              },
              {
                label: "Block Hours",
                content: <ContractBlockHours action={fetchContractBlockHoursAction} />,
              },
              {
                label: "Aging Tickets",
                content: <AgingOpenTickets action={fetchAgingOpenTicketsAction} />,
              },
            ],
          },
          {
            group: "NinjaOne",
            tabs: [
              {
                label: "Offline Devices",
                content: <OfflineDevicesLookup action={fetchOfflineDevicesAction} />,
              },
              {
                label: "Disk Alerts",
                content: <DiskAlertsLookup action={fetchDiskAlertsAction} />,
              },
              {
                label: "Hardware Lifecycle",
                content: (
                  <HardwareLifecycleLookup agingAction={fetchAgingHardwareAction} eolAction={fetchOsEolAction} />
                ),
              },
              {
                label: "Antivirus",
                content: <AntivirusAlertsLookup action={fetchAntivirusAlertsAction} />,
              },
              {
                label: "Missing Patches",
                content: <MissingPatchesLookup action={fetchMissingPatchesAction} />,
              },
            ],
          },
          {
            group: "Microsoft 365",
            tabs: [
              {
                label: "Secure Score",
                content: <SecureScoreRollup action={fetchSecureScoreRollupAction} />,
              },
              {
                label: "License Utilization",
                content: <LicenseUtilizationRollup action={fetchLicenseUtilizationRollupAction} />,
              },
              {
                label: "MFA Gaps",
                content: <MfaGapsRollup action={fetchMfaGapsRollupAction} />,
              },
              {
                label: "Inactive Accounts",
                content: <InactiveAccountsRollup action={fetchInactiveAccountsRollupAction} />,
              },
              {
                label: "Privileged Roles",
                content: <PrivilegedRolesRollup action={fetchPrivilegedRolesRollupAction} />,
              },
              {
                label: "Mailbox Storage",
                content: <MailboxUsageRollup action={fetchMailboxUsageRollupAction} />,
              },
            ],
          },
          {
            group: "Huntress",
            tabs: [
              {
                label: "Huntress Agents",
                content: <HuntressAgentAlerts action={fetchHuntressAgentAlertsAction} />,
              },
              {
                label: "Huntress Incidents",
                content: <HuntressOpenIncidents action={fetchHuntressOpenIncidentsAction} />,
              },
              {
                label: "Huntress SIEM",
                content: <HuntressSiemLogs action={fetchHuntressSiemLogsAction} />,
              },
            ],
          },
          {
            group: "Bitdefender",
            tabs: [
              {
                label: "Bitdefender Endpoints",
                content: <BitdefenderEndpoints action={fetchGravityZoneEndpointsAction} />,
              },
              {
                label: "Bitdefender Incidents",
                content: <BitdefenderOpenIncidents action={fetchGravityZoneOpenIncidentsAction} />,
              },
            ],
          },
          {
            group: "FortiCloud",
            tabs: [
              {
                label: "FortiCloud Devices",
                content: <ForticloudDevices action={fetchForticloudDevicesAction} />,
              },
            ],
          },
          {
            group: "Wizer",
            tabs: [
              {
                label: "Training & Phishing",
                content: <WizerTrainingMetrics action={fetchWizerCompanyMetricsAction} />,
              },
            ],
          },
        ]}
      />
    </div>
  );
}
