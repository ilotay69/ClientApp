import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ReportPreviewPanel, type ReportDefinition } from "@/components/report-preview-panel";
import { GroupedTabs } from "@/components/grouped-tabs";
import { getReportPreviewAction } from "./actions";

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

const DEVICE_INVENTORY: ReportDefinition = {
  key: "devices",
  downloadHref: "/api/reports/devices",
  title: "Device inventory",
  description:
    "Every NinjaOne-synced device across all clients — OS, status, hardware age. As current as each client's last NinjaOne sync.",
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

export default async function ReportsPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a report to preview it, then download the full CSV if it's what you need.
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
            ],
          },
          {
            group: "NinjaOne",
            tabs: [
              {
                label: DEVICE_INVENTORY.title,
                content: <ReportPreviewPanel report={DEVICE_INVENTORY} previewAction={getReportPreviewAction} />,
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
            ],
          },
        ]}
      />
    </div>
  );
}
