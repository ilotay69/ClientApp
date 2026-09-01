import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientForm } from "@/components/client-form";
import { ClientContactsPanel } from "@/components/client-contacts-panel";
import { ClientTimeline, type TimelineEntry } from "@/components/client-timeline";
import { ClientAutotaskTickets } from "@/components/client-autotask-tickets";
import { ClientAutotaskContractServices } from "@/components/client-autotask-contract-services";
import { SyncAutotaskButton } from "@/components/sync-autotask-button";
import { SuggestionCard } from "@/components/suggestion-card";
import { RefreshClientInsightsButton } from "@/components/refresh-client-insights-button";
import { Tabs } from "@/components/tabs";
import { ComingSoonCard } from "@/components/coming-soon-card";
import { Badge, OverdueBadge } from "@/components/badge";
import { AssigneeSelect } from "@/components/assignee-select";
import { ServiceCheckQuickAdd } from "@/components/service-check-quick-add";
import { ClientServiceQuickAdd } from "@/components/client-service-quick-add";
import { formatDate, isOverdue, isServiceCheckOverdue, daysAgo, buildFollowupSummary } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import {
  updateClientRecord,
  deleteClientRecord,
  addClientContact,
  removeClientContact,
  logClientInteraction,
  searchAutotaskCompaniesAction,
  linkClientAutotaskCompany,
  unlinkClientAutotaskCompany,
  syncClientAutotaskData,
  getAutotaskTicketDetailAction,
  refreshClientInsightsAction,
} from "../actions";
import {
  addClientServiceCheck,
  assignServiceCheck,
  markServiceChecked,
  removeClientServiceCheck,
} from "../../settings/services/actions";
import { attachClientService, detachClientService } from "../../settings/catalog/actions";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: client },
    { data: projects },
    { data: touchpoints },
    { data: emails },
    { data: tasks },
    { data: serviceChecks },
    { data: catalog },
    { data: members },
    { data: clientServices },
    { data: services },
    canManageServices,
    { data: contacts },
    { data: interactions },
    canManageClients,
    { data: autotaskTickets },
    { data: suggestions },
    { data: autotaskContractServices },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("projects")
      .select("id, name, status, target_end_date")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("touchpoints")
      .select("id, type, due_date, completed_at")
      .eq("client_id", id)
      .order("due_date", { ascending: false }),
    supabase
      .from("email_links")
      .select("id, type, subject, from_name, from_email, received_at, web_link")
      .eq("client_id", id)
      .order("received_at", { ascending: false })
      .limit(20),
    supabase
      .from("tasks")
      .select("id, kind, title, status, due_date, profiles:assigned_to(full_name)")
      .eq("client_id", id)
      .not("status", "in", "(done,dismissed)")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("client_service_checks")
      .select(
        "id, cadence_days, last_checked_at, assigned_to, service_id, service_catalog(name, default_cadence_days)"
      )
      .eq("client_id", id),
    supabase.from("service_catalog").select("id, name, default_cadence_days").order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("client_services").select("service_id, services(id, name)").eq("client_id", id),
    supabase.from("services").select("id, name").order("name"),
    hasPermission(supabase, "manage_services"),
    supabase.from("client_contacts").select("id, name, email").eq("client_id", id).order("name"),
    supabase
      .from("client_interactions")
      .select("id, type, subject, body, created_at, client_contacts(name), profiles(full_name)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    hasPermission(supabase, "manage_clients"),
    supabase
      .from("autotask_tickets")
      .select(
        "id, ticket_number, title, description, resolution, status, priority, queue_name, assigned_resource_name, due_date, last_activity_at"
      )
      .eq("client_id", id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("suggestions")
      .select("id, kind, summary, detail, priority")
      .eq("client_id", id)
      .eq("status", "open")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("autotask_contract_services")
      .select("id, contract_name, contract_status, service_name, description, quantity")
      .eq("client_id", id)
      .order("contract_name"),
  ]);

  if (!client) notFound();

  const addContactAction = addClientContact.bind(null, id);
  const removeContactAction = removeClientContact.bind(null, id);
  const logInteractionAction = logClientInteraction.bind(null, id);
  const linkAutotaskAction = linkClientAutotaskCompany.bind(null, id);
  const unlinkAutotaskAction = unlinkClientAutotaskCompany.bind(null, id);
  const syncAutotaskAction = syncClientAutotaskData.bind(null, id);
  const ticketDetailAction = getAutotaskTicketDetailAction.bind(null, id);
  const refreshInsightsAction = refreshClientInsightsAction.bind(null, id);

  const stalestAutotaskTicket = (autotaskTickets ?? []).reduce<
    { title: string; last_activity_at: string | null } | null
  >((stalest, t) => {
    if (!t.last_activity_at) return stalest;
    if (!stalest || !stalest.last_activity_at || t.last_activity_at < stalest.last_activity_at) return t;
    return stalest;
  }, null);
  const followupSummary = buildFollowupSummary({
    taskCount: (tasks ?? []).length,
    overdueTaskCount: (tasks ?? []).filter((t) => isOverdue(t.due_date)).length,
    ticketCount: (autotaskTickets ?? []).length,
    stalestTicketTitle: stalestAutotaskTicket?.title ?? null,
    stalestTicketDays: daysAgo(stalestAutotaskTicket?.last_activity_at ?? null),
    lastContactDays: daysAgo((interactions ?? [])[0]?.created_at ?? null),
  });

  const timelineEntries: TimelineEntry[] = [
    ...(emails ?? []).map((e) => ({
      id: `email-${e.id}`,
      type: "email" as const,
      subject: e.subject,
      body: null,
      contactName: e.from_name ?? e.from_email,
      date: e.received_at,
      webLink: e.web_link,
    })),
    ...(interactions ?? []).map((i) => ({
      id: `interaction-${i.id}`,
      type: i.type as TimelineEntry["type"],
      subject: i.subject,
      body: i.body,
      contactName: (i.client_contacts as unknown as { name: string } | null)?.name ?? null,
      date: i.created_at,
      loggedBy: (i.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const updateAction = updateClientRecord.bind(null, id);
  const addServiceCheckAction = addClientServiceCheck.bind(null, id);
  const trackedServiceIds = new Set((serviceChecks ?? []).map((sc) => sc.service_id));
  const availableCatalog = (catalog ?? []).filter((c) => !trackedServiceIds.has(c.id));

  const attachServiceAction = attachClientService.bind(null, id);
  const attachedServiceIds = new Set((clientServices ?? []).map((cs) => cs.service_id));
  const availableServices = (services ?? []).filter((s) => !attachedServiceIds.has(s.id));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/clients" className="text-sm text-slate-500 hover:underline">
            ← All clients
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {client.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {client.autotask_company_id && <SyncAutotaskButton action={syncAutotaskAction} />}
          <DeleteButton
            action={deleteClientRecord.bind(null, id)}
            confirmText={`Delete ${client.name}? This also removes their projects, touchpoints, tasks, and service checks.`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Client details
          </h2>
          <ClientForm client={client} action={updateAction} submitLabel="Save changes" />
        </div>

        <ClientContactsPanel
          contacts={contacts ?? []}
          canManageClients={canManageClients}
          addAction={addContactAction}
          removeAction={removeContactAction}
        />
      </div>

      <Tabs
        tabs={[
              {
                label: "Overview",
                content: (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                        <h2 className="text-sm font-semibold text-slate-900">Insights</h2>
                        <RefreshClientInsightsButton action={refreshInsightsAction} />
                      </div>
                      <div className="divide-y divide-slate-100">
                        {(suggestions ?? []).map((s) => (
                          <SuggestionCard
                            key={s.id}
                            id={s.id}
                            clientId={id}
                            clientName={client.name}
                            kind={s.kind}
                            summary={s.summary}
                            detail={s.detail}
                            priority={s.priority}
                            members={members ?? []}
                          />
                        ))}
                        {(suggestions ?? []).length === 0 && (
                          <p className="px-5 py-4 text-sm text-slate-600">
                            {followupSummary ?? (
                              <span className="text-slate-500">No open insights right now.</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    <RelatedSection
                      title="Open tasks"
                      newHref="/tasks"
                      emptyText="Nothing assigned right now."
                    >
                      {(tasks ?? []).map((t) => (
                        <Link
                          key={t.id}
                          href="/tasks"
                          className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{t.title}</p>
                            <p className="text-xs text-slate-500">
                              {(t.profiles as unknown as { full_name: string } | null)?.full_name ??
                                "Unassigned"}
                              {t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOverdue(t.due_date) && <OverdueBadge />}
                            <Badge value={t.kind} />
                          </div>
                        </Link>
                      ))}
                    </RelatedSection>

                    <RelatedSection
                      title="Projects"
                      newHref={`/projects/new?client_id=${id}`}
                      emptyText="No projects yet."
                    >
                      {(projects ?? []).map((p) => (
                        <Link
                          key={p.id}
                          href={`/projects/${p.id}`}
                          className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{p.name}</p>
                            <p className="text-xs text-slate-500">
                              Target {formatDate(p.target_end_date)}
                            </p>
                          </div>
                          <Badge value={p.status} />
                        </Link>
                      ))}
                    </RelatedSection>

                    <RelatedSection
                      title="Touchpoints"
                      newHref={`/touchpoints/new?client_id=${id}`}
                      emptyText="No touchpoints scheduled."
                    >
                      {(touchpoints ?? []).map((t) => (
                        <Link
                          key={t.id}
                          href={`/touchpoints/${t.id}`}
                          className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {formatDate(t.due_date)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t.completed_at ? `Completed ${formatDate(t.completed_at)}` : "Not completed"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!t.completed_at && isOverdue(t.due_date) && <OverdueBadge />}
                            <Badge value={t.type} />
                          </div>
                        </Link>
                      ))}
                    </RelatedSection>
                  </>
                ),
              },
              {
                label: "Services & Devices",
                content: (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-200 px-5 py-3">
                        <h2 className="text-sm font-semibold text-slate-900">Services</h2>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {(clientServices ?? []).map((cs) => {
                          const svc = cs.services as unknown as { id: string; name: string } | null;
                          return (
                            <div
                              key={cs.service_id}
                              className="flex items-center justify-between gap-3 px-5 py-3"
                            >
                              <p className="text-sm font-medium text-slate-900">
                                {svc?.name ?? "Service"}
                              </p>
                              {canManageServices && (
                                <DeleteButton
                                  action={detachClientService.bind(null, id, cs.service_id)}
                                  confirmText={`Remove "${svc?.name ?? "this service"}" from ${client.name}?`}
                                  label="Remove"
                                />
                              )}
                            </div>
                          );
                        })}
                        {(clientServices ?? []).length === 0 && (
                          <p className="px-5 py-4 text-sm text-slate-500">
                            No services attached for this client yet.
                          </p>
                        )}
                      </div>
                      {canManageServices && availableServices.length > 0 && (
                        <ClientServiceQuickAdd
                          available={availableServices}
                          action={attachServiceAction}
                        />
                      )}
                    </div>

                    <ClientAutotaskContractServices
                      companyId={client.autotask_company_id}
                      services={autotaskContractServices ?? []}
                    />

                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-200 px-5 py-3">
                        <h2 className="text-sm font-semibold text-slate-900">Service checks</h2>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {(serviceChecks ?? []).map((sc) => {
                          const svc = sc.service_catalog as unknown as {
                            name: string;
                            default_cadence_days: number;
                          } | null;
                          const cadence = sc.cadence_days ?? svc?.default_cadence_days ?? 90;
                          const overdue = isServiceCheckOverdue(sc.last_checked_at, cadence);
                          return (
                            <div
                              key={sc.id}
                              className="flex items-center justify-between gap-3 px-5 py-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900">
                                  {svc?.name ?? "Service"}
                                </p>
                                <p className="text-xs text-slate-500">
                                  Last checked {formatDate(sc.last_checked_at)} · every {cadence} days
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {overdue && <OverdueBadge />}
                                <AssigneeSelect
                                  id={sc.id}
                                  currentAssignee={sc.assigned_to}
                                  members={members ?? []}
                                  action={assignServiceCheck}
                                />
                                <form action={markServiceChecked.bind(null, sc.id, id)}>
                                  <button
                                    type="submit"
                                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                                  >
                                    Checked today
                                  </button>
                                </form>
                                <DeleteButton
                                  action={removeClientServiceCheck.bind(null, sc.id, id)}
                                  confirmText={`Stop tracking "${svc?.name ?? "this service"}" for ${client.name}?`}
                                  label="Remove"
                                />
                              </div>
                            </div>
                          );
                        })}
                        {(serviceChecks ?? []).length === 0 && (
                          <p className="px-5 py-4 text-sm text-slate-500">
                            No services tracked for this client yet.
                          </p>
                        )}
                      </div>
                      {availableCatalog.length > 0 && (
                        <ServiceCheckQuickAdd
                          catalog={availableCatalog}
                          members={members ?? []}
                          action={addServiceCheckAction}
                        />
                      )}
                    </div>

                    <ComingSoonCard
                      title="Devices"
                      description="Device inventory and health (patch status, antivirus, last seen) pulled from NinjaOne will show up here once that integration is connected."
                    />
                  </>
                ),
              },
              {
                label: "Timeline",
                content: (
                  <ClientTimeline
                    entries={timelineEntries}
                    contacts={contacts ?? []}
                    logAction={logInteractionAction}
                  />
                ),
              },
              {
                label: "Tickets",
                content: (
                  <ClientAutotaskTickets
                    companyId={client.autotask_company_id}
                    tickets={autotaskTickets ?? []}
                    searchAction={searchAutotaskCompaniesAction}
                    linkAction={linkAutotaskAction}
                    unlinkAction={unlinkAutotaskAction}
                    detailAction={ticketDetailAction}
                  />
                ),
              },
            ]}
          />
    </div>
  );
}

function RelatedSection({
  title,
  newHref,
  emptyText,
  children,
}: {
  title: string;
  newHref?: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {newHref && (
          <Link href={newHref} className="text-sm text-slate-600 hover:underline">
            + Add
          </Link>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {hasChildren ? children : (
          <p className="px-5 py-4 text-sm text-slate-500">{emptyText}</p>
        )}
      </div>
    </div>
  );
}
