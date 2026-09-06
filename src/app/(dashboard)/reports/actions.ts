"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import {
  buildClientRosterReport,
  buildDeviceInventoryReport,
  buildOpenTicketsReport,
  buildHoursSummaryReport,
  type ReportCell,
} from "@/lib/reports";

export type ReportKey = "clients" | "devices" | "tickets" | "hours";

export type ReportPreview = {
  headers: string[];
  rows: ReportCell[][];
  totalRows: number;
  truncated: boolean;
};

const PREVIEW_LIMIT = 50;

/** Same query/column logic each CSV download route uses (see
 * src/lib/reports.ts) — capped to a preview window so a large export
 * doesn't mean rendering thousands of table rows just to look at it
 * before deciding to download. */
export async function getReportPreviewAction(key: ReportKey): Promise<ReportPreview | { error: string }> {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return { error: "You don't have permission to do that." };
  }

  try {
    let data;
    if (key === "clients") {
      data = await buildClientRosterReport(supabase);
    } else if (key === "devices") {
      data = await buildDeviceInventoryReport(supabase);
    } else if (key === "tickets") {
      data = await buildOpenTicketsReport(supabase);
    } else {
      const admin = createAdminClient();
      const settings = await getAutotaskSettings(admin);
      if (!settings?.zoneUrl) {
        return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
      }
      data = await buildHoursSummaryReport(admin, settings.credentials, settings.zoneUrl);
    }

    return {
      headers: data.headers,
      rows: data.rows.slice(0, PREVIEW_LIMIT),
      totalRows: data.rows.length,
      truncated: data.rows.length > PREVIEW_LIMIT,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load report." };
  }
}
