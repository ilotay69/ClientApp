import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ServiceCoverageAnalysis } from "@/components/service-coverage-analysis";
import { TimeEntryPatterns } from "@/components/time-entry-patterns";
import { EntityTrendChart } from "@/components/entity-trend-chart";
import { ResourceClientPairsTable } from "@/components/resource-client-pairs-table";
import { ContractBurndownChart } from "@/components/contract-burndown-chart";
import { Tabs } from "@/components/tabs";
import { hasPermission } from "@/lib/permissions";
import {
  getClientsForAnalysisAction,
  getClientServiceGapsAction,
  analyzeClientTimeEntryPatternsAction,
} from "./actions";
import {
  getResourcesForAnalysisAction,
  getClientHoursTrendAction,
  getResourceHoursTrendAction,
  getResourceClientPairsAction,
  getTicketVolumeTrendAction,
  getActiveBlockOptionsAction,
  getContractBurndownAction,
} from "./trend-actions";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_services"))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analysis</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI-driven reports across clients and services. More analyses land here over time.
        </p>
      </div>

      <Tabs
        tabs={[
          {
            label: "Sales opportunities",
            content: (
              <ServiceCoverageAnalysis
                fetchClientsAction={getClientsForAnalysisAction}
                fetchGapsAction={getClientServiceGapsAction}
              />
            ),
          },
          {
            label: "Ticket Pattern",
            content: (
              <TimeEntryPatterns
                fetchClientsAction={getClientsForAnalysisAction}
                analyzeAction={analyzeClientTimeEntryPatternsAction}
              />
            ),
          },
          {
            label: "Hours Trend",
            content: (
              <EntityTrendChart
                key="hours-trend"
                title="Hours per client, over time"
                subtitle="Weekly hours logged for one client — rising or falling usage, at a glance."
                entityLabel="client"
                fetchEntitiesAction={getClientsForAnalysisAction}
                fetchTrendAction={getClientHoursTrendAction}
                seriesName="Hours"
                color="#066ab5"
              />
            ),
          },
          {
            label: "Resource Utilization",
            content: (
              <EntityTrendChart
                key="resource-utilization"
                title="Hours per resource, over time"
                subtitle="Weekly hours logged by one resource — workload trend, over/under-utilization."
                entityLabel="resource"
                fetchEntitiesAction={getResourcesForAnalysisAction}
                fetchTrendAction={getResourceHoursTrendAction}
                seriesName="Hours"
                color="#10b981"
              />
            ),
          },
          {
            label: "Resource/Client Pairs",
            content: <ResourceClientPairsTable action={getResourceClientPairsAction} />,
          },
          {
            label: "Ticket Volume",
            content: (
              <EntityTrendChart
                key="ticket-volume"
                title="Ticket volume per client, over time"
                subtitle="Weekly count of tickets opened for one client — a rising trend on an otherwise-stable client is often the first sign of an unstable environment."
                entityLabel="client"
                fetchEntitiesAction={getClientsForAnalysisAction}
                fetchTrendAction={getTicketVolumeTrendAction}
                seriesName="Tickets"
                color="#8b5cf6"
                chartType="bar"
                valueUnit="count"
              />
            ),
          },
          {
            label: "Block Burn-down",
            content: (
              <ContractBurndownChart
                fetchBlocksAction={getActiveBlockOptionsAction}
                fetchBurndownAction={getContractBurndownAction}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
