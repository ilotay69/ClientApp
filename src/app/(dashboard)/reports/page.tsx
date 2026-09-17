import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ReportPreviewPanel, type ReportDefinition } from "@/components/report-preview-panel";
import { ContractUsageLookup } from "@/components/contract-usage-lookup";
import { HoursLookup } from "@/components/hours-lookup";
import { TicketLookup } from "@/components/ticket-lookup";
import { HuntressSiemLogs } from "@/components/huntress-siem-logs";
import { GroupedTabs } from "@/components/grouped-tabs";
import { getReportPreviewAction } from "./actions";
import {
  fetchContractUsageAction,
  sendContractUsageReportAction,
  fetchHoursByGroupAction,
  fetchNonBillableHoursByGroupAction,
  searchAutotaskTicketsAction,
} from "../hours/actions";
import { fetchHuntressSiemLogsAction } from "../hours/huntress-actions";

export const dynamic = "force-dynamic";

const CLIENT_ROSTER: ReportDefinition = {
  key: "clients",
  downloadHref: "/api/reports/clients",
  title: "Client roster",
  description: "Every client with their primary contact and which integrations they're mapped to.",
};

const OPEN_TICKETS: ReportDefinition = {
  key: "tickets",
  downloadHref: "/api/reports/tickets",
  title: "Open tickets",
  description:
    "Every open Autotask ticket across all clients, oldest activity first. As current as each client's last Autotask sync.",
};

const HOURS_SUMMARY: ReportDefinition = {
  key: "hours",
  downloadHref: "/api/reports/hours",
  title: "Hours summary",
  description: "Today/yesterday/week/month logged hours per client, live from Autotask.",
};

const RESOURCE_HOURS: ReportDefinition = {
  key: "resource_hours",
  downloadHref: "/api/reports/resource-hours",
  title: "Resource hours",
  description: "Today/yesterday/week/month logged hours per resource (technician), live from Autotask.",
};

const YESTERDAY_ENTRIES: ReportDefinition = {
  key: "yesterday_entries",
  downloadHref: "/api/reports/yesterday-entries",
  title: "Yesterday's time entries",
  description: "Every individual time entry from the last business day, live from Autotask.",
};

const BLOCK_HOURS: ReportDefinition = {
  key: "block_hours",
  downloadHref: "/api/reports/block-hours",
  title: "Block hours remaining",
  description:
    "Purchased/used/remaining for every active Contract Block, account-wide — for a single client's own usage with an email-to-client option, use Block of hrs usage below instead.",
};

const AGING_TICKETS: ReportDefinition = {
  key: "aging_tickets",
  downloadHref: "/api/reports/aging-tickets",
  title: "Aging tickets",
  description: "Every open Autotask ticket account-wide, oldest/most-overdue first.",
};

const DEVICE_INVENTORY: ReportDefinition = {
  key: "devices",
  downloadHref: "/api/reports/devices",
  title: "Device inventory",
  description:
    "Every NinjaOne-synced device across all clients — OS, status, hardware age. As current as each client's last NinjaOne sync.",
};

const OFFLINE_DEVICES: ReportDefinition = {
  key: "offline_devices",
  downloadHref: "/api/reports/offline-devices",
  title: "Offline devices",
  description: "Every offline device across all clients, from the last NinjaOne sync.",
};

const DISK_ALERTS: ReportDefinition = {
  key: "disk_alerts",
  downloadHref: "/api/reports/disk-alerts",
  title: "Disk alerts",
  description: "Every device account-wide over the disk-usage alert threshold, from the last NinjaOne sync.",
};

const AGING_HARDWARE: ReportDefinition = {
  key: "aging_hardware",
  downloadHref: "/api/reports/aging-hardware",
  title: "Aging hardware",
  description: "Every device account-wide by hardware age, from the last NinjaOne sync.",
};

const OS_EOL: ReportDefinition = {
  key: "os_eol",
  downloadHref: "/api/reports/os-eol",
  title: "OS end-of-life",
  description: "Every device account-wide running an OS approaching or past its end-of-life date.",
};

const ANTIVIRUS_ALERTS: ReportDefinition = {
  key: "antivirus_alerts",
  downloadHref: "/api/reports/antivirus-alerts",
  title: "Antivirus alerts",
  description: "Every device account-wide whose antivirus isn't actively protecting it, live from NinjaOne.",
};

const MISSING_PATCHES: ReportDefinition = {
  key: "missing_patches",
  downloadHref: "/api/reports/missing-patches",
  title: "Missing patches",
  description: "Every device account-wide with a missing patch, live from NinjaOne.",
};

const FORTICLOUD_DEVICES: ReportDefinition = {
  key: "forticloud",
  downloadHref: "/api/reports/forticloud",
  title: "FortiCloud devices",
  description: "Every registered device across every FortiCloud account, live — support/license status and hardware end-of-support date.",
};

const BITDEFENDER_ENDPOINTS: ReportDefinition = {
  key: "bitdefender_endpoints",
  downloadHref: "/api/reports/bitdefender",
  title: "Bitdefender endpoints",
  description: "Every protected endpoint across every company, live — OS, last successful scan, and agent update status.",
};

const BITDEFENDER_OPEN_INCIDENTS: ReportDefinition = {
  key: "bitdefender_open_incidents",
  downloadHref: "/api/reports/bitdefender-open-incidents",
  title: "Bitdefender Incidents",
  description: "Every EDR/XDR incident account-wide still open or in progress, highest priority first, live.",
};

const SECURE_SCORE_ROLLUP: ReportDefinition = {
  key: "secure_score_rollup",
  downloadHref: "/api/reports/secure-score-rollup",
  title: "Secure Score",
  description: "Microsoft Secure Score across every client with an M365 tenant linked, live from Graph.",
};

const LICENSE_UTILIZATION: ReportDefinition = {
  key: "license_utilization",
  downloadHref: "/api/reports/license-utilization",
  title: "License Utilization",
  description: "Assigned vs. available seats per license SKU across every client, live from Graph.",
};

const MFA_GAPS: ReportDefinition = {
  key: "mfa_gaps",
  downloadHref: "/api/reports/mfa-gaps",
  title: "MFA Gaps",
  description: "Every user account-wide without MFA registered, live from Graph.",
};

const INACTIVE_ACCOUNTS: ReportDefinition = {
  key: "inactive_accounts",
  downloadHref: "/api/reports/inactive-accounts",
  title: "Inactive Accounts",
  description: "Every user account-wide with no recent sign-in activity, live from Graph.",
};

const PRIVILEGED_ROLES: ReportDefinition = {
  key: "privileged_roles",
  downloadHref: "/api/reports/privileged-roles",
  title: "Privileged Roles",
  description: "Every privileged Entra role assignment across every client, live from Graph.",
};

const MAILBOX_USAGE_ROLLUP: ReportDefinition = {
  key: "mailbox_usage_rollup",
  downloadHref: "/api/reports/mailbox-usage-rollup",
  title: "Mailbox Storage",
  description: "Mailbox storage usage across every client with an M365 tenant linked, live from Graph.",
};

const HUNTRESS_AGENT_ALERTS: ReportDefinition = {
  key: "huntress_agent_alerts",
  downloadHref: "/api/reports/huntress-agent-alerts",
  title: "Huntress Agents",
  description:
    "Every Huntress agent account-wide with a real health concern — no check-in, missing EDR, unhealthy Defender or firewall, live.",
};

const HUNTRESS_OPEN_INCIDENTS: ReportDefinition = {
  key: "huntress_open_incidents",
  downloadHref: "/api/reports/huntress-open-incidents",
  title: "Huntress Incidents",
  description: "Every Huntress incident report account-wide still actively open, critical severity first, live.",
};

const WIZER_METRICS: ReportDefinition = {
  key: "wizer_metrics",
  downloadHref: "/api/reports/wizer",
  title: "Wizer training metrics",
  description: "Training completion and phishing simulation results per company, live.",
};

export default async function ReportsPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    redirect("/dashboard");
  }

  // Only clients actually mapped to Autotask can be looked up this way —
  // an unmapped one would just fail with "not linked" on every search.
  const { data: autotaskClients } = await supabase
    .from("clients")
    .select("id, name, email:primary_contact_email")
    .not("autotask_company_id", "is", null)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a report to preview it, then download the full CSV if it's what you need. A few tabs
          below are interactive tools instead — pick a client, a date range, or type a search — for
          data that doesn't fit a fixed export.
        </p>
      </div>

      <GroupedTabs
        groups={[
          {
            group: "General",
            tabs: [
              {
                label: CLIENT_ROSTER.title,
                content: <ReportPreviewPanel report={CLIENT_ROSTER} previewAction={getReportPreviewAction} />,
              },
            ],
          },
          {
            group: "Autotask",
            tabs: [
              {
                label: OPEN_TICKETS.title,
                content: <ReportPreviewPanel report={OPEN_TICKETS} previewAction={getReportPreviewAction} />,
              },
              {
                label: HOURS_SUMMARY.title,
                content: <ReportPreviewPanel report={HOURS_SUMMARY} previewAction={getReportPreviewAction} />,
              },
              {
                label: RESOURCE_HOURS.title,
                content: <ReportPreviewPanel report={RESOURCE_HOURS} previewAction={getReportPreviewAction} />,
              },
              {
                label: YESTERDAY_ENTRIES.title,
                content: <ReportPreviewPanel report={YESTERDAY_ENTRIES} previewAction={getReportPreviewAction} />,
              },
              {
                label: BLOCK_HOURS.title,
                content: <ReportPreviewPanel report={BLOCK_HOURS} previewAction={getReportPreviewAction} />,
              },
              {
                label: "Block of hrs usage",
                content: (
                  <ContractUsageLookup
                    clients={autotaskClients ?? []}
                    action={fetchContractUsageAction}
                    sendAction={sendContractUsageReportAction}
                  />
                ),
              },
              {
                label: AGING_TICKETS.title,
                content: <ReportPreviewPanel report={AGING_TICKETS} previewAction={getReportPreviewAction} />,
              },
              // The three tabs below are interactive tools, not fixed
              // reports — groupBy/days/search are picked live, so there's
              // no static dataset a CSV download could represent. Moved
              // here from the retired Lookups page rather than left behind.
              {
                label: "Hours by Group",
                content: <HoursLookup key="by-client-or-resource" action={fetchHoursByGroupAction} />,
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
                label: "Ticket Lookup",
                content: <TicketLookup clients={autotaskClients ?? []} action={searchAutotaskTicketsAction} />,
              },
            ],
          },
          {
            group: "NinjaOne",
            tabs: [
              {
                label: DEVICE_INVENTORY.title,
                content: <ReportPreviewPanel report={DEVICE_INVENTORY} previewAction={getReportPreviewAction} />,
              },
              {
                label: OFFLINE_DEVICES.title,
                content: <ReportPreviewPanel report={OFFLINE_DEVICES} previewAction={getReportPreviewAction} />,
              },
              {
                label: DISK_ALERTS.title,
                content: <ReportPreviewPanel report={DISK_ALERTS} previewAction={getReportPreviewAction} />,
              },
              {
                label: AGING_HARDWARE.title,
                content: <ReportPreviewPanel report={AGING_HARDWARE} previewAction={getReportPreviewAction} />,
              },
              {
                label: OS_EOL.title,
                content: <ReportPreviewPanel report={OS_EOL} previewAction={getReportPreviewAction} />,
              },
              {
                label: ANTIVIRUS_ALERTS.title,
                content: <ReportPreviewPanel report={ANTIVIRUS_ALERTS} previewAction={getReportPreviewAction} />,
              },
              {
                label: MISSING_PATCHES.title,
                content: <ReportPreviewPanel report={MISSING_PATCHES} previewAction={getReportPreviewAction} />,
              },
            ],
          },
          {
            group: "Microsoft 365",
            tabs: [
              {
                label: SECURE_SCORE_ROLLUP.title,
                content: <ReportPreviewPanel report={SECURE_SCORE_ROLLUP} previewAction={getReportPreviewAction} />,
              },
              {
                label: LICENSE_UTILIZATION.title,
                content: <ReportPreviewPanel report={LICENSE_UTILIZATION} previewAction={getReportPreviewAction} />,
              },
              {
                label: MFA_GAPS.title,
                content: <ReportPreviewPanel report={MFA_GAPS} previewAction={getReportPreviewAction} />,
              },
              {
                label: INACTIVE_ACCOUNTS.title,
                content: <ReportPreviewPanel report={INACTIVE_ACCOUNTS} previewAction={getReportPreviewAction} />,
              },
              {
                label: PRIVILEGED_ROLES.title,
                content: <ReportPreviewPanel report={PRIVILEGED_ROLES} previewAction={getReportPreviewAction} />,
              },
              {
                label: MAILBOX_USAGE_ROLLUP.title,
                content: <ReportPreviewPanel report={MAILBOX_USAGE_ROLLUP} previewAction={getReportPreviewAction} />,
              },
            ],
          },
          {
            group: "Huntress",
            tabs: [
              {
                label: HUNTRESS_AGENT_ALERTS.title,
                content: <ReportPreviewPanel report={HUNTRESS_AGENT_ALERTS} previewAction={getReportPreviewAction} />,
              },
              {
                label: HUNTRESS_OPEN_INCIDENTS.title,
                content: (
                  <ReportPreviewPanel report={HUNTRESS_OPEN_INCIDENTS} previewAction={getReportPreviewAction} />
                ),
              },
              {
                label: "Huntress SIEM",
                content: <HuntressSiemLogs action={fetchHuntressSiemLogsAction} />,
              },
            ],
          },
          {
            group: "FortiCloud",
            tabs: [
              {
                label: FORTICLOUD_DEVICES.title,
                content: <ReportPreviewPanel report={FORTICLOUD_DEVICES} previewAction={getReportPreviewAction} />,
              },
            ],
          },
          {
            group: "Bitdefender",
            tabs: [
              {
                label: BITDEFENDER_ENDPOINTS.title,
                content: <ReportPreviewPanel report={BITDEFENDER_ENDPOINTS} previewAction={getReportPreviewAction} />,
              },
              {
                label: BITDEFENDER_OPEN_INCIDENTS.title,
                content: (
                  <ReportPreviewPanel report={BITDEFENDER_OPEN_INCIDENTS} previewAction={getReportPreviewAction} />
                ),
              },
            ],
          },
          {
            group: "Wizer",
            tabs: [
              {
                label: WIZER_METRICS.title,
                content: <ReportPreviewPanel report={WIZER_METRICS} previewAction={getReportPreviewAction} />,
              },
            ],
          },
        ]}
      />
    </div>
  );
}
