import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ReportBrowser, type ReportDefinition } from "@/components/report-browser";
import { getReportPreviewAction } from "./actions";

export const dynamic = "force-dynamic";

const REPORTS: ReportDefinition[] = [
  {
    key: "clients",
    downloadHref: "/api/reports/clients",
    title: "Client roster",
    description: "Every client with their primary contact and which integrations they're mapped to.",
  },
  {
    key: "devices",
    downloadHref: "/api/reports/devices",
    title: "Device inventory",
    description:
      "Every NinjaOne-synced device across all clients — OS, status, hardware age. As current as each client's last NinjaOne sync.",
  },
  {
    key: "tickets",
    downloadHref: "/api/reports/tickets",
    title: "Open tickets",
    description:
      "Every open Autotask ticket across all clients, oldest activity first. As current as each client's last Autotask sync.",
  },
  {
    key: "hours",
    downloadHref: "/api/reports/hours",
    title: "Hours summary",
    description: "Today/yesterday/week/month logged hours per client, live from Autotask.",
  },
];

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

      <ReportBrowser reports={REPORTS} previewAction={getReportPreviewAction} />
    </div>
  );
}
