"use server";

import {
  fetchMyOpenTicketsAction,
  fetchUnassignedLevel1TicketsAction,
  fetchForticloudExpiringDevicesAction,
} from "./actions";
import { fetchResourceHoursAction } from "../hours/actions";
import {
  groupSeries,
  type SourceKey,
  type WidgetData,
} from "@/lib/dashboard-workspace";
import { requirePermission } from "@/lib/permissions";

/** Reuses the existing integration actions, including their permission checks.
 * An error or missing account mapping is never presented as a zero result. */
export async function fetchLiveDashboardWidget(
  key: SourceKey,
): Promise<WidgetData> {
  if (!(await requirePermission("view_dashboard")))
    throw new Error("Dashboard access is required.");
  const base: WidgetData = {
    key,
    value: 0,
    unit: "items",
    series: [],
    rows: [],
    empty: "Nothing in this queue right now.",
  };
  if (key === "my_tickets") {
    const result = await fetchMyOpenTicketsAction();
    if ("error" in result) return { ...base, error: result.error };
    if (result.matchedResourceName === null)
      return {
        ...base,
        error:
          "Connect Autotask and map your resource under Settings → My Profile to see your tickets.",
      };
    return {
      ...base,
      value: result.tickets.length,
      unit: "open tickets",
      href: "/my-todo?tab=tickets",
      series: groupSeries(result.tickets.map((t) => t.priority)),
      rows: result.tickets.map((t) => ({
        id: String(t.id),
        title: t.title,
        detail: [t.ticketNumber, t.clientName].filter(Boolean).join(" · "),
        badge: t.priority ?? undefined,
        href: t.ticketUrl ?? "/my-todo?tab=tickets",
      })),
    };
  }
  if (key === "unassigned_l1_tickets") {
    const result = await fetchUnassignedLevel1TicketsAction();
    if ("error" in result) return { ...base, error: result.error };
    return {
      ...base,
      value: result.rows.length,
      unit: "unassigned tickets",
      series: groupSeries(result.rows.map((r) => r.priority)),
      rows: result.rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        detail: `${r.ticketNumber ?? "Ticket"} · ${r.clientName}`,
        badge: r.priority ?? undefined,
        href: r.ticketUrl ?? undefined,
      })),
    };
  }
  if (key === "forticloud_expiring") {
    const result = await fetchForticloudExpiringDevicesAction();
    if ("error" in result) return { ...base, error: result.error };
    return {
      ...base,
      value: result.rows.length,
      unit: "devices to renew",
      series: groupSeries(result.rows.map((r) => r.supportStatus)),
      rows: result.rows.map((r) => ({
        id: `${r.accountLabel}-${r.serialNumber}`,
        title: r.productModel,
        detail: `${r.accountLabel} · ${r.serialNumber}`,
        badge: r.supportEndDate?.slice(0, 10) ?? r.supportStatus,
        urgent: r.supportStatus === "expired",
      })),
    };
  }
  if (key === "hours_worked") {
    const result = await fetchResourceHoursAction();
    if ("error" in result) return { ...base, error: result.error };
    const rows = [...result.rows].sort((a, b) => b.thisMonth - a.thisMonth);
    return {
      ...base,
      value: rows.reduce((sum, r) => sum + r.thisMonth, 0),
      unit: "hours this month",
      href: "/dashboard/resource-hours",
      series: rows.map((r) => ({ label: r.resourceName, value: r.thisMonth })),
      rows: rows.map((r) => ({
        id: r.resourceId ?? r.resourceName,
        title: r.resourceName,
        detail: `Today ${r.today.toFixed(1)}h · Yesterday ${r.yesterday.toFixed(1)}h`,
        badge: `${r.thisMonth.toFixed(1)}h`,
        href: `/dashboard/resource-hours?date=${result.yesterdayDate}`,
      })),
    };
  }
  throw new Error("Unknown live widget.");
}
