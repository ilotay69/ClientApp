import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Badge, OverdueBadge } from "@/components/badge";
import { AlertRow } from "@/components/alert-row";
import {
  DashboardWidgetCard,
  DashboardHeroCard,
  DashboardBar,
  DashboardDot,
  type DashboardAccent,
} from "@/components/dashboard-widget-card";
import { DashboardDonut, DashboardGauge } from "@/components/dashboard-charts";
import { TeamHoursWidget } from "@/components/team-hours-widget";
import { Level1QueueWidget } from "@/components/level1-queue-widget";
import { DashboardRefreshButton } from "@/components/dashboard-refresh-button";
import {
  IconAlertTriangle,
  IconCheckSquare,
  IconCalendar,
  IconFolder,
  IconUsers,
  IconClipboardCheck,
  IconTag,
  IconFlag,
} from "@/components/icons";
import { formatDate, isOverdue } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import {
  getEligibleDashboardWidgetKeys,
  getDashboardPreference,
  resolveDashboardWidgets,
} from "@/lib/dashboard-widgets";
import { fetchAllReviews, reviewBucket, getQuarterlyReviewApproverEmail } from "@/lib/quarterly-review-data";
import { fetchMyOpenAutotaskTickets } from "@/lib/my-tickets";
import { fetchResourceHoursAction } from "../hours/actions";
import {
  acknowledgeAlertAction,
  fetchUnassignedLevel1TicketsAction,
  fetchLevel1TicketDescriptionAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Same pipeline order and labels as resume-status-select.tsx/resume-filter-bar.tsx
// (not exported from either — one's a "use client" component, the other's
// scoped to its own filter bar) — kept in sync by hand since resume_status
// only grows a new value a couple of times a year.
const RECRUITMENT_STATUS_ORDER: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "contacting", label: "Contacting" },
  { value: "invited", label: "Invited" },
  { value: "interviewing", label: "Interviewing" },
  { value: "second_interview", label: "2nd Interview" },
  { value: "both_done", label: "Both Done" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: me }, canViewDashboard] = await Promise.all([
    supabase.from("profiles").select("role, full_name").eq("id", user?.id ?? "").single(),
    hasPermission(supabase, "view_dashboard"),
  ]);

  // Every other gated page falls back to /dashboard on missing
  // permission — this page can't do the same (that would loop), so it
  // shows an inline notice instead of redirecting anywhere.
  if (!canViewDashboard) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">No access</h1>
        <p className="mt-2 text-sm text-slate-500">
          You don&apos;t have permission to view the Dashboard. Ask an Owner to grant it from
          Team → Roles &amp; permissions.
        </p>
      </div>
    );
  }

  const [eligibleKeys, preference, approverEmail] = await Promise.all([
    getEligibleDashboardWidgetKeys(supabase),
    user?.id ? getDashboardPreference(user.id) : Promise.resolve({ enabledWidgets: null }),
    getQuarterlyReviewApproverEmail(),
  ]);
  const widgets = resolveDashboardWidgets(eligibleKeys, preference);
  const enabled = new Set(widgets.map((w) => w.key));
  const isApprover = (user?.email ?? "").toLowerCase() === approverEmail.toLowerCase();

  const [
    { data: myTasks },
    { data: allOpenTasks },
    { data: dueTouchpoints },
    { data: activeProjects },
    { data: myAlerts },
    allReviews,
    { data: openSalesRequests },
    { data: recruitmentRows },
    myTickets,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, kind, title, due_date, clients(name)")
      .eq("assigned_to", user?.id ?? "")
      .not("status", "in", "(done,dismissed)")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("tasks")
      .select("id, assigned_to, profiles:assigned_to(full_name)")
      .eq("is_personal", false)
      .not("status", "in", "(done,dismissed)"),
    supabase
      .from("touchpoints")
      .select("id, contact_method, due_date, owner_id, clients(name)")
      .is("completed_at", null)
      .order("due_date", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, status, target_end_date, clients(name)")
      .in("status", ["planning", "active", "on_hold"])
      .order("target_end_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("alerts")
      .select("id, title, detail, href")
      .eq("recipient_id", user?.id ?? "")
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false }),
    enabled.has("quarterly_reviews") ? fetchAllReviews() : Promise.resolve([]),
    supabase
      .from("sales_requests")
      .select("id, title, stage, clients(name)")
      .not("stage", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false }),
    supabase.from("resumes").select("status"),
    enabled.has("my_tickets")
      ? fetchMyOpenAutotaskTickets(createAdminClient(), me?.full_name ?? null)
      : Promise.resolve([]),
  ]);

  const myOpenTouchpoints = (dueTouchpoints ?? []).filter((t) => t.owner_id === user?.id);
  const overdueTouchpoints = (dueTouchpoints ?? []).filter((t) => isOverdue(t.due_date));
  const upcomingTouchpoints = (dueTouchpoints ?? []).filter((t) => !isOverdue(t.due_date));

  const workloadByPerson = new Map<string, number>();
  for (const t of allOpenTasks ?? []) {
    const name =
      (t.profiles as unknown as { full_name: string } | null)?.full_name ??
      (t.assigned_to ? "Unknown" : "Unassigned");
    workloadByPerson.set(name, (workloadByPerson.get(name) ?? 0) + 1);
  }

  const myReviews = (allReviews ?? []).filter(
    (r) =>
      (r.createdById === user?.id && reviewBucket(r.status) !== "sent") ||
      (isApprover && r.status === "submitted")
  );

  const overdueMyTasks = (myTasks ?? []).filter((t) => isOverdue(t.due_date));
  const dueTodayMyTasks = (myTasks ?? []).filter((t) => t.due_date === today);
  const alertCount = (myAlerts ?? []).length;
  const showsTouchpoints = eligibleKeys.has("touchpoints_due");
  const needsYouTotal =
    overdueMyTasks.length + alertCount + (showsTouchpoints ? overdueTouchpoints.length : 0);

  // Explicit timezone — the server runs in UTC, so a plain getHours() would
  // wish someone "good evening" over their Toronto lunch break.
  const torontoHour = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  const partOfDay = torontoHour < 12 ? "Good morning" : torontoHour < 17 ? "Good afternoon" : "Good evening";
  const firstName = me?.full_name ? me.full_name.split(" ")[0] : "";
  const heroStats = [
    { label: "Overdue tasks", value: overdueMyTasks.length, href: "/tasks?mine=1" },
    { label: "Due today", value: dueTodayMyTasks.length, href: "/tasks?mine=1" },
    ...(showsTouchpoints
      ? [{ label: "Touchpoints due", value: overdueTouchpoints.length, href: "/touchpoints" }]
      : []),
    { label: "Alerts", value: alertCount, href: "/dashboard" },
  ];
  const maxWorkload = Math.max(0, ...workloadByPerson.values());
  const onTimeRate =
    (myTasks ?? []).length > 0
      ? (((myTasks ?? []).length - overdueMyTasks.length) / (myTasks ?? []).length) * 100
      : 100;
  const projectStatusCounts = { planning: 0, active: 0, on_hold: 0 };
  for (const p of activeProjects ?? []) {
    if (p.status === "planning") projectStatusCounts.planning++;
    else if (p.status === "active") projectStatusCounts.active++;
    else if (p.status === "on_hold") projectStatusCounts.on_hold++;
  }

  // A Map (not a plain object literal) specifically so tallying by a
  // dynamic string key never hits the same "implicitly any" indexing
  // problem projectStatusCounts did above.
  const recruitmentStatusCounts = new Map<string, number>();
  for (const r of recruitmentRows ?? []) {
    recruitmentStatusCounts.set(r.status, (recruitmentStatusCounts.get(r.status) ?? 0) + 1);
  }
  const newCandidateCount = recruitmentStatusCounts.get("new") ?? 0;
  // Regenerated fresh every time this Server Component actually re-runs
  // (a real navigation, or DashboardRefreshButton's router.refresh() —
  // this page is force-dynamic, so both re-execute this function) — used
  // only as a React key below, to remount the widgets that fetch their
  // own data client-side on mount rather than receiving it as props, so
  // "Refresh" also gets them to fetch again instead of showing stale rows.
  const refreshToken = Date.now().toString();

  return (
    <div className="space-y-4">
      <DashboardHeroCard
        greeting={`${partOfDay}${firstName ? `, ${firstName}` : ""} — here's your day`}
        subtitle={needsYouTotal === 1 ? "thing needs you right now" : "things need you right now"}
        total={needsYouTotal}
        stats={heroStats}
        action={<DashboardRefreshButton />}
      />

      {(myAlerts ?? []).length > 0 && enabled.has("alerts") && (
        <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-white shadow-sm">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
              <IconAlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">Alerts</p>
              <p className="truncate text-xs font-medium text-red-700/70">waiting on you</p>
            </div>
            <span className="ml-auto text-3xl font-bold tabular-nums text-red-600">
              {(myAlerts ?? []).length}
            </span>
          </div>
          <div className="mx-2 mb-2 overflow-hidden rounded-xl bg-white/80 ring-1 ring-slate-100">
            <div className="divide-y divide-slate-100">
              {(myAlerts ?? []).slice(0, 5).map((a) => (
                <AlertRow key={a.id} id={a.id} title={a.title} detail={a.detail} href={a.href} action={acknowledgeAlertAction} />
              ))}
            </div>
            {(myAlerts ?? []).length > 5 && (
              <details className="group border-t border-slate-100">
                <summary className="cursor-pointer list-none px-4 py-2 text-xs font-medium text-brand hover:underline [&::-webkit-details-marker]:hidden">
                  Show {(myAlerts ?? []).length - 5} more
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {(myAlerts ?? []).slice(5).map((a) => (
                    <AlertRow key={a.id} id={a.id} title={a.title} detail={a.detail} href={a.href} action={acknowledgeAlertAction} />
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {enabled.has("my_tasks") && (
          <DashboardWidgetCard
            title="My Open Tasks"
            count={myTasks?.length ?? 0}
            countLabel="assigned to you"
            icon={IconCheckSquare}
            accent="blue"
            href="/tasks?mine=1"
            urgent={(myTasks ?? []).some((t) => isOverdue(t.due_date))}
          >
            {(myTasks ?? []).length > 0 && (
              <div className="border-b border-slate-100">
                <DashboardGauge value={onTimeRate} label="on time" strokeClassName="stroke-blue-500" />
              </div>
            )}
            {(myTasks ?? []).length === 0 ? (
              <EmptyRow text="Nothing assigned to you right now." />
            ) : (
              (myTasks ?? []).slice(0, 5).map((t) => (
                <WidgetRow accent="blue" key={t.id} href="/tasks">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {(t.clients as unknown as { name: string } | null)?.name ?? "No client"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOverdue(t.due_date) && <OverdueBadge />}
                    <span className="text-xs text-slate-500">{formatDate(t.due_date)}</span>
                  </div>
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("my_tickets") && (
          <DashboardWidgetCard
            title="My Tickets"
            count={myTickets.length}
            countLabel="open Autotask tickets"
            icon={IconFlag}
            accent="pink"
            href="/my-todo?tab=tickets"
          >
            {myTickets.length === 0 ? (
              <EmptyRow text="No open tickets assigned to you." />
            ) : (
              myTickets.slice(0, 5).map((t) => (
                <WidgetRow accent="pink" key={t.id} href="/my-todo?tab=tickets">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {t.ticketNumber ? `#${t.ticketNumber} — ` : ""}
                      {t.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">{t.clientName ?? "Unknown client"}</p>
                  </div>
                  {t.priority && <Badge value={t.priority} />}
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("unassigned_l1_tickets") && (
          <Level1QueueWidget
            key={refreshToken}
            action={fetchUnassignedLevel1TicketsAction}
            descriptionAction={fetchLevel1TicketDescriptionAction}
          />
        )}

        {enabled.has("touchpoints_due") && (
          <DashboardWidgetCard
            title="Touchpoints Past Due"
            count={overdueTouchpoints.length}
            countLabel="overdue"
            icon={IconCalendar}
            accent="amber"
            href="/touchpoints"
            urgent={overdueTouchpoints.length > 0}
          >
            {overdueTouchpoints.length === 0 ? (
              <EmptyRow text="Nothing overdue." />
            ) : (
              overdueTouchpoints.slice(0, 5).map((t) => (
                <WidgetRow accent="amber" key={t.id} href={`/touchpoints/${t.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {(t.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
                    </p>
                    <p className="text-xs text-slate-500">Due {formatDate(t.due_date)}</p>
                  </div>
                  {t.contact_method && <Badge value={t.contact_method} />}
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("active_projects") && (
          <DashboardWidgetCard
            title="Active Projects"
            count={activeProjects?.length ?? 0}
            countLabel="in progress"
            icon={IconFolder}
            accent="purple"
            href="/projects"
            urgent={(activeProjects ?? []).some((p) => isOverdue(p.target_end_date))}
          >
            {(activeProjects ?? []).length > 0 && (
              <div className="border-b border-slate-100">
                <DashboardDonut
                  segments={[
                    {
                      label: "Active",
                      value: projectStatusCounts.active,
                      strokeClassName: "stroke-purple-500",
                      dotClassName: "bg-purple-500",
                    },
                    {
                      label: "Planning",
                      value: projectStatusCounts.planning,
                      strokeClassName: "stroke-purple-300",
                      dotClassName: "bg-purple-300",
                    },
                    {
                      label: "On hold",
                      value: projectStatusCounts.on_hold,
                      strokeClassName: "stroke-amber-400",
                      dotClassName: "bg-amber-400",
                    },
                  ]}
                />
              </div>
            )}
            {(activeProjects ?? []).length === 0 ? (
              <EmptyRow text="No active projects." />
            ) : (
              (activeProjects ?? []).slice(0, 5).map((p) => (
                <WidgetRow accent="purple" key={p.id} href={`/projects/${p.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {(p.clients as unknown as { name: string } | null)?.name ?? "No client"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {p.target_end_date ? `Target ${formatDate(p.target_end_date)}` : ""}
                  </span>
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("team_workload") && (
          <DashboardWidgetCard
            title="Team Workload"
            count={[...workloadByPerson.values()].reduce((sum, n) => sum + n, 0)}
            countLabel="open tasks across the team"
            icon={IconUsers}
            accent="indigo"
            href="/tasks?view=all"
          >
            {workloadByPerson.size === 0 ? (
              <EmptyRow text="Nothing assigned across the team." />
            ) : (
              <div className="divide-y divide-slate-100">
                {[...workloadByPerson.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([name, count], i) => (
                    <div key={name} className="px-4 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{name}</span>
                        <span className="shrink-0 text-sm font-semibold text-indigo-600 tabular-nums">{count}</span>
                      </div>
                      <div className="mt-1 pl-7">
                        <DashboardBar accent="indigo" value={count} max={maxWorkload} />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("hours_worked") && <TeamHoursWidget key={refreshToken} action={fetchResourceHoursAction} />}

        {enabled.has("touchpoints_upcoming") && (
          <DashboardWidgetCard
            title="Touchpoints Coming Up"
            count={upcomingTouchpoints.length}
            countLabel="scheduled"
            icon={IconCalendar}
            accent="amber"
            href="/touchpoints"
          >
            {upcomingTouchpoints.length === 0 ? (
              <EmptyRow text="No touchpoints scheduled." />
            ) : (
              upcomingTouchpoints.slice(0, 5).map((t) => (
                <WidgetRow accent="amber" key={t.id} href={`/touchpoints/${t.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {(t.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
                    </p>
                    <p className="text-xs text-slate-500">Due {formatDate(t.due_date)}</p>
                  </div>
                  {t.contact_method && <Badge value={t.contact_method} />}
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("quarterly_reviews") && (
          <DashboardWidgetCard
            title="Quarterly Reviews"
            count={myReviews.length}
            countLabel="need your attention"
            icon={IconClipboardCheck}
            accent="teal"
            href="/quarterly-reviews"
            urgent={myReviews.length > 0}
          >
            {myReviews.length === 0 ? (
              <EmptyRow text="Nothing needs your attention." />
            ) : (
              myReviews.slice(0, 5).map((r) => (
                <WidgetRow accent="teal" key={r.id} href={`/quarterly-reviews/${r.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.clientName}</p>
                    <p className="truncate text-xs text-slate-500">{r.reviewPeriod}</p>
                  </div>
                  <Badge value={r.status} />
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("sales_requests") && (
          <DashboardWidgetCard
            title="Internal Sales"
            count={openSalesRequests?.length ?? 0}
            countLabel="open requests"
            icon={IconTag}
            accent="emerald"
            href="/sales-requests"
          >
            {(openSalesRequests ?? []).length === 0 ? (
              <EmptyRow text="Nothing open right now." />
            ) : (
              (openSalesRequests ?? []).slice(0, 5).map((r) => (
                <WidgetRow accent="emerald" key={r.id} href="/sales-requests">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {(r.clients as unknown as { name: string } | null)?.name ?? "Internal"}
                    </p>
                  </div>
                  <Badge value={r.stage} />
                </WidgetRow>
              ))
            )}
          </DashboardWidgetCard>
        )}

        {enabled.has("recruitment") && (
          <DashboardWidgetCard
            title="Recruitment"
            count={newCandidateCount}
            countLabel="new candidates"
            icon={IconUsers}
            accent="pink"
            href="/recruitment"
          >
            <div className="divide-y divide-slate-100">
              {RECRUITMENT_STATUS_ORDER.map((s) => (
                <Link
                  key={s.value}
                  href={`/recruitment?status=${s.value}`}
                  className="flex items-center justify-between gap-3 px-4 py-1.5 hover:bg-slate-50"
                >
                  <Badge value={s.value} label={s.label} />
                  <span className="text-sm font-semibold tabular-nums text-slate-700">
                    {recruitmentStatusCounts.get(s.value) ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          </DashboardWidgetCard>
        )}
      </div>

      {enabled.has("my_tasks") && myOpenTouchpoints.length > 0 && !enabled.has("touchpoints_upcoming") && (
        // Falls back to a plain list only if the touchpoint widgets above are
        // both off but the user still has some due — keeps "my touchpoints"
        // reachable even with a pared-down widget selection.
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-900">Your touchpoints coming up</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {myOpenTouchpoints.slice(0, 8).map((t) => (
              <WidgetRow key={t.id} href={`/touchpoints/${t.id}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {(t.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
                  </p>
                  <p className="text-xs text-slate-500">Due {formatDate(t.due_date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isOverdue(t.due_date) && <OverdueBadge />}
                  {t.contact_method && <Badge value={t.contact_method} />}
                </div>
              </WidgetRow>
            ))}
          </div>
        </div>
      )}

      {widgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            Every widget is turned off.{" "}
            <Link href="/settings/dashboard" className="font-medium text-brand underline">
              Choose what to show
            </Link>
            .
          </p>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Want a different mix?{" "}
        <Link href="/settings/dashboard" className="underline">
          Choose what shows on your Dashboard
        </Link>
        .
      </p>
    </div>
  );
}

function WidgetRow({
  href,
  accent,
  children,
}: {
  href: string;
  accent?: DashboardAccent;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-slate-50">
      {accent && <DashboardDot accent={accent} />}
      {/* Keeps each caller's own left/right pair split as before, with the
          dot sitting outside it rather than being pushed away by it. */}
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">{children}</span>
    </Link>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-4 py-2 text-sm text-slate-500">{text}</p>;
}
