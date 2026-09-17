import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { HoursLookup } from "@/components/hours-lookup";
import { TicketLookup } from "@/components/ticket-lookup";
import { HuntressSiemLogs } from "@/components/huntress-siem-logs";
import { BitdefenderEndpoints } from "@/components/bitdefender-endpoints";
import { BitdefenderOpenIncidents } from "@/components/bitdefender-open-incidents";
import { ForticloudDevices } from "@/components/forticloud-devices";
import { WizerTrainingMetrics } from "@/components/wizer-training-metrics";
import { GroupedTabs } from "@/components/grouped-tabs";
import {
  fetchHoursByGroupAction,
  fetchNonBillableHoursByGroupAction,
  searchAutotaskTicketsAction,
} from "./actions";
import { fetchHuntressSiemLogsAction } from "./huntress-actions";
import { fetchGravityZoneEndpointsAction, fetchGravityZoneOpenIncidentsAction } from "./bitdefender-actions";
import { fetchForticloudDevicesAction } from "./forticloud-actions";
import { fetchWizerCompanyMetricsAction } from "./wizer-actions";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_lookups"))) {
    redirect("/dashboard");
  }

  // Only clients actually mapped to Autotask can be searched this way —
  // an unmapped one would just fail with "not linked" on every search.
  const { data: autotaskClients } = await supabase
    .from("clients")
    .select("id, name, email:primary_contact_email")
    .not("autotask_company_id", "is", null)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lookups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Interactive tools you drive yourself — pick a client, a date range, or type a search —
          rather than a fixed dataset. For a fixed report you can preview and download as a CSV,
          see Reports instead.
        </p>
      </div>

      <GroupedTabs
        groups={[
          {
            group: "Autotask",
            tabs: [
              // The fixed per-resource today/yesterday/week/month table that
              // used to sit above this (ResourceHoursReport) moved to
              // Reports → "Resource hours" — it had zero parameters, so it's
              // a real report. This tool stays here because it isn't one:
              // groupBy and days are picked live, so there's no fixed
              // dataset a static CSV download could represent.
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
                content: (
                  <TicketLookup clients={autotaskClients ?? []} action={searchAutotaskTicketsAction} />
                ),
              },
            ],
          },
          {
            group: "Huntress",
            tabs: [
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
