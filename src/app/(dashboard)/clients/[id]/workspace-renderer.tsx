import "server-only";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ClientWorkspace } from "@/components/clients/workspace";
import { ClientOverview } from "@/components/clients/overview";
import {
  ClientActivity,
  type InteractionActions,
} from "@/components/clients/activity";
import {
  ClientSourcePanel,
  type ClientSource,
} from "@/components/clients/source-panel";
import { ClientDetailsEditor } from "@/components/clients/details-editor";
import {
  ClientContactRecords,
  ClientDeviceRecords,
  ClientTicketRecords,
} from "@/components/clients/records";
import { ClientDetailsForm } from "@/components/client-details-form";
import { ClientContactsPanel } from "@/components/client-contacts-panel";
import { ClientAutotaskTickets } from "@/components/client-autotask-tickets";
import type { NinjaOneDeviceRow } from "@/components/client-ninjaone-devices";
import type { M365LicenseRow } from "@/components/client-m365-licenses";
import type { M365IntuneDeviceRow } from "@/components/client-m365-intune-devices";
import type { M365IntunePolicyRow } from "@/components/client-m365-intune-policies";
import type { M365RiskyUserRow } from "@/components/client-m365-risky-users";
import type { M365RiskDetectionRow } from "@/components/client-m365-risk-detections";
import type { M365UserAuditRow } from "@/components/client-m365-user-audit";
import type { M365ConditionalAccessPolicyRow } from "@/components/client-m365-conditional-access";
import type { M365MailboxUsageRow } from "@/components/client-m365-mailbox-usage";
import type { AutotaskContractServiceRow } from "@/components/client-autotask-contract-services";
import type { TimelineEntry } from "@/components/client-timeline";
import {
  CGRecordTable,
  type RecordColumn,
  type WorkspaceRecord,
} from "@/components/ui/record-table";
import { ClientInsightParagraph } from "@/components/client-insight-paragraph";
import { RefreshClientInsightsButton } from "@/components/refresh-client-insights-button";
import { DeleteButton } from "@/components/delete-button";
import { sectionLegacyLabel, type ClientSection } from "@/lib/client-workspace";
import { formatDate, humanizeLabel } from "@/lib/format";
import { extractDomainFromEmail } from "@/lib/domain-health";
import { friendlyM365SkuName } from "@/lib/m365-sku-names";
import s from "@/components/ui/client-surfaces.module.css";

type DetailsProps = ComponentProps<typeof ClientDetailsForm>;
type ContactProps = ComponentProps<typeof ClientContactsPanel>;
type TicketProps = ComponentProps<typeof ClientAutotaskTickets>;
type WorkspaceData = {
  id: string;
  section: ClientSection;
  sub?: string;
  compose?: string;
  userId: string;
  ownerName: string | null;
  client: {
    name: string;
    primary_contact_name: string | null;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    address: string | null;
    notes: string | null;
    owner_id: string | null;
    autotask_company_id: number | null;
    ninjaone_organization_id: number | null;
    m365_tenant_id: string | null;
    huntress_organization_id: string | null;
    ninjaone_last_synced_at?: string | null;
    m365_last_synced_at?: string | null;
  };
  permissions: ComponentProps<typeof ClientWorkspace>["permissions"];
  contacts: ContactProps["contacts"];
  members: DetailsProps["members"];
  clientOptions: { id: string; name: string }[];
  projects: {
    id: string;
    name: string;
    status: string;
    target_end_date: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    kind: string;
    status: string;
    due_date: string | null;
    detail?: string | null;
    notes?: string | null;
    profiles: unknown;
  }[];
  touchpoints: {
    id: string;
    due_date: string;
    completed_at: string | null;
    contact_method: string | null;
  }[];
  sales: { id: string; title: string; stage: string; source: string }[];
  tickets: TicketProps["tickets"];
  devices: NinjaOneDeviceRow[];
  licenses: M365LicenseRow[];
  intuneDevices: M365IntuneDeviceRow[];
  intunePolicies: M365IntunePolicyRow[];
  riskyUsers: M365RiskyUserRow[];
  riskDetections: M365RiskDetectionRow[];
  userAudit: M365UserAuditRow[];
  conditionalAccess: M365ConditionalAccessPolicyRow[];
  mailboxes: M365MailboxUsageRow[];
  contracts: AutotaskContractServiceRow[];
  timeline: TimelineEntry[];
  errors: string[];
  deleteError?: string;
  suggestions: {
    id: string;
    summary: string;
    detail: string | null;
    priority: "normal" | "high" | "low";
  }[];
  groups: { group: string; tabs: { label: string; content: ReactNode }[] }[];
  actions: InteractionActions & {
    save: DetailsProps["saveAction"];
    deleteClient: () => Promise<void>;
    syncAutotask: () => Promise<{ error: string | null }>;
    syncNinjaOne: () => Promise<{ error: string | null }>;
    syncM365: () => Promise<{ error: string | null }>;
    ticketDetail: TicketProps["detailAction"];
    analyzeTickets: TicketProps["analyzeAction"];
    refreshInsights: ComponentProps<
      typeof RefreshClientInsightsButton
    >["action"];
    removeContact: ContactProps["removeAction"];
    searchContacts: ContactProps["searchAutotaskAction"];
    addContacts: ContactProps["addFromAutotaskAction"];
  };
};

/** Server-only composition: only the active section is sent to the browser.
 * The legacy panels remain available without duplicating their data queries. */
export function renderClientWorkspace(data: WorkspaceData) {
  const { id, client, section, sub, permissions, actions, errors } = data;
  const interactionActions = {
    log: actions.log,
    upload: actions.upload,
    remove: actions.remove,
  };
  const sources: ClientSource[] = [
    {
      name: "Autotask",
      connected: Boolean(client.autotask_company_id),
      action: permissions.manage ? actions.syncAutotask : undefined,
      note: "Tickets, contracts, projects and primary contact.",
    },
    {
      name: "NinjaOne",
      connected: Boolean(client.ninjaone_organization_id),
      lastAttempt: client.ninjaone_last_synced_at,
      action: permissions.manage ? actions.syncNinjaOne : undefined,
      note: "Device inventory. An automatic attempt does not confirm completion.",
    },
    {
      name: "Microsoft 365",
      connected: Boolean(client.m365_tenant_id),
      lastAttempt: client.m365_last_synced_at,
      action: permissions.manage ? actions.syncM365 : undefined,
      note: "Licenses and Secure Score; identity and Intune data depend on the tenant’s granted permissions. A refresh may return partial data.",
    },
    {
      name: "Huntress",
      connected: Boolean(client.huntress_organization_id),
      note: "Available endpoint data is requested when you open Huntress.",
    },
  ];
  let content: ReactNode = data.groups
    .flatMap((group) => group.tabs)
    .find((tab) => tab.label === sectionLegacyLabel(section, sub))?.content;
  if (section === "overview")
    content = (
      <ClientOverview
        data={{
          id,
          userId: data.userId,
          today: new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Toronto",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
          primaryName: client.primary_contact_name,
          email: client.primary_contact_email,
          phone: client.primary_contact_phone,
          owner: data.ownerName,
          tasks: data.tasks,
          projects: data.projects,
          touchpoints: data.touchpoints,
          ticketCount:
            !client.autotask_company_id || errors.includes("tickets")
              ? null
              : data.tickets.length,
          taskCount: errors.includes("tasks") ? null : data.tasks.length,
          projectCount: errors.includes("projects")
            ? null
            : data.projects.filter((project) => project.status === "active")
                .length,
          touchpointsAvailable:
            permissions.touchpoints && !errors.includes("touchpoints"),
          timeline: data.timeline,
        }}
        insights={
          <section className={s.card}>
            <div className={s.cardHeader}>
              <h3>Client insights</h3>
              {permissions.manage && (
                <RefreshClientInsightsButton action={actions.refreshInsights} />
              )}
            </div>
            {data.suggestions.length ? (
              data.suggestions.map((suggestion) => (
                <ClientInsightParagraph key={suggestion.id} {...suggestion} />
              ))
            ) : (
              <p className={s.muted}>
                {errors.includes("insights")
                  ? "Insights are unavailable."
                  : "No open insights in the available records."}
              </p>
            )}
          </section>
        }
      />
    );
  if (section === "activity" || section === "documents")
    content = (
      <ClientActivity
        key={`${id}:${section}`}
        entries={data.timeline}
        contacts={data.contacts}
        actions={interactionActions}
        userId={data.userId}
        canManage={permissions.manage}
        documentsOnly={section === "documents"}
      />
    );
  if (section === "contacts")
    content = (
      <ClientContactRecords
        primaryContactName={client.primary_contact_name}
        primaryContactEmail={client.primary_contact_email}
        contacts={data.contacts}
        canManageClients={permissions.manage}
        removeAction={actions.removeContact}
        hasAutotaskMapping={Boolean(client.autotask_company_id)}
        searchAutotaskAction={actions.searchContacts}
        addFromAutotaskAction={actions.addContacts}
      />
    );
  if (section === "connections")
    content = (
      <ClientSourcePanel
        sources={sources}
        inline
        mappingHref={
          permissions.mapping ? "/settings/client-mapping" : undefined
        }
      />
    );
  if (section === "settings")
    content = (
      <div className={s.stack}>
        <ClientDetailsEditor
          clientId={id}
          primaryContactName={client.primary_contact_name}
          primaryContactEmail={client.primary_contact_email}
          primaryContactPhone={client.primary_contact_phone}
          address={client.address}
          notes={client.notes}
          ownerId={client.owner_id}
          ownerName={data.ownerName}
          members={data.members}
          canEdit={permissions.manage}
          saveAction={actions.save}
        />
        {permissions.manage && (
          <details className={s.card}>
            <summary className={s.muted}>Danger zone</summary>
            <p className={s.muted} style={{ margin: "16px 0" }}>
              Deleting this client also removes related projects, tasks,
              touchpoints and service checks. This action cannot be undone here.
            </p>
            <DeleteButton
              action={actions.deleteClient}
              label="Delete client"
              confirmText={`Permanently delete ${client.name} and its related records?`}
            />
          </details>
        )}
      </div>
    );
  if (section === "tickets")
    content = (
      <ClientTicketRecords
        key={id}
        companyId={client.autotask_company_id}
        tickets={data.tickets}
        detailAction={actions.ticketDetail}
        analyzeAction={actions.analyzeTickets}
      />
    );
  if (section === "devices")
    content = (
      <ClientDeviceRecords
        key={id}
        organizationId={client.ninjaone_organization_id}
        devices={data.devices}
      />
    );
  if (section === "tasks")
    content = (
      <div className={s.stack}>
        <Link className={s.button} href={`/tasks?client=${id}&client_id=${id}`}>
          Open client tasks / add task →
        </Link>
        <CGRecordTable
          label="Tasks"
          columns={[
            { key: "status", label: "Status" },
            { key: "due", label: "Due" },
            { key: "assignee", label: "Assignee" },
          ]}
          rows={data.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            sortValues: { due: task.due_date || "9999-12-31" },
            values: {
              status: humanizeLabel(task.status),
              due: task.due_date ? formatDate(task.due_date) : "Unscheduled",
              assignee:
                (task.profiles as { full_name?: string } | null)?.full_name ??
                "Unassigned",
            },
            details: [
              { label: "Status", value: humanizeLabel(task.status) },
              { label: "Type", value: humanizeLabel(task.kind) },
              {
                label: "Due",
                value: task.due_date
                  ? formatDate(task.due_date)
                  : "Unscheduled",
              },
              { label: "Details", value: task.detail ?? null },
              { label: "Notes", value: task.notes ?? null },
            ],
          }))}
        />
      </div>
    );
  if (section === "projects")
    content = (
      <div className={s.stack}>
        {permissions.projects && (
          <Link className={s.button} href={`/projects/new?client_id=${id}`}>
            + New project
          </Link>
        )}
        <CGRecordTable
          label="Projects"
          columns={[
            { key: "status", label: "Status" },
            { key: "target", label: "Target date" },
          ]}
          rows={data.projects.map((project) => ({
            id: project.id,
            title: project.name,
            sortValues: { target: project.target_end_date || "9999-12-31" },
            href: `/projects/${project.id}`,
            values: {
              status: humanizeLabel(project.status),
              target: project.target_end_date
                ? formatDate(project.target_end_date)
                : "Not scheduled",
            },
          }))}
        />
      </div>
    );
  if (section === "touchpoints")
    content = (
      <div className={s.stack}>
        <Link className={s.button} href={`/touchpoints/new?client_id=${id}`}>
          + Schedule touchpoint
        </Link>
        <CGRecordTable
          label="Touchpoints"
          columns={[
            { key: "status", label: "Status" },
            { key: "method", label: "Contact method" },
          ]}
          rows={data.touchpoints.map((item) => ({
            id: item.id,
            title: formatDate(item.due_date),
            href: `/touchpoints/${item.id}`,
            values: {
              status: item.completed_at ? "Completed" : "Scheduled",
              method: item.contact_method
                ? humanizeLabel(item.contact_method)
                : "Not set",
            },
          }))}
        />
      </div>
    );
  if (section === "sales")
    content = (
      <div className={s.stack}>
        <Link className={s.button} href={`/sales-requests?client=${id}`}>
          Open client sales pipeline →
        </Link>
        <CGRecordTable
          label="Sales requests"
          columns={[
            { key: "stage", label: "Stage" },
            { key: "source", label: "Source" },
          ]}
          rows={data.sales.map((request) => ({
            id: request.id,
            title: request.title,
            values: {
              stage: humanizeLabel(request.stage),
              source: humanizeLabel(request.source),
            },
          }))}
        />
      </div>
    );
  if (section === "licenses")
    content = records(
      "Licenses",
      data.licenses,
      "sku_part_number",
      [
        { key: "consumed_units", label: "Assigned" },
        { key: "enabled_units", label: "Available units" },
      ],
      Boolean(client.m365_tenant_id),
    );
  if (section === "mailboxes")
    content = records(
      "Mailboxes",
      data.mailboxes,
      "display_name",
      [
        { key: "user_principal_name", label: "User" },
        { key: "storage_used_bytes", label: "Used" },
        { key: "prohibit_send_receive_quota_bytes", label: "Quota" },
      ],
      Boolean(client.m365_tenant_id),
    );
  if (section === "contracts")
    content = records(
      "Contract services",
      data.contracts,
      "service_name",
      [
        { key: "contract_name", label: "Contract" },
        { key: "contract_status", label: "Status" },
        { key: "quantity", label: "Quantity" },
      ],
      Boolean(client.autotask_company_id),
    );
  if (section === "intune")
    content =
      sub === "policies"
        ? records(
            "Intune policies",
            data.intunePolicies,
            "display_name",
            [
              { key: "policy_kind", label: "Kind" },
              { key: "modified_date_time", label: "Modified" },
            ],
            Boolean(client.m365_tenant_id),
          )
        : records(
            "Intune devices",
            data.intuneDevices,
            "device_name",
            [
              { key: "compliance_state", label: "Compliance" },
              { key: "operating_system", label: "OS" },
              { key: "user_principal_name", label: "User" },
            ],
            Boolean(client.m365_tenant_id),
          );
  if (section === "identity")
    content =
      sub === "access"
        ? records(
            "Conditional Access policies",
            data.conditionalAccess,
            "display_name",
            [
              { key: "state", label: "State" },
              { key: "modified_date_time", label: "Modified" },
            ],
            Boolean(client.m365_tenant_id),
          )
        : sub === "risky"
          ? records(
              "Risky users",
              data.riskyUsers,
              "display_name",
              [
                { key: "risk_level", label: "Risk level" },
                { key: "risk_state", label: "State" },
                { key: "user_principal_name", label: "User" },
              ],
              Boolean(client.m365_tenant_id),
            )
          : sub === "detections"
            ? records(
                "Risk detections",
                data.riskDetections,
                "display_name",
                [
                  { key: "risk_level", label: "Risk level" },
                  { key: "risk_event_type", label: "Event" },
                  { key: "detected_date_time", label: "Detected" },
                ],
                Boolean(client.m365_tenant_id),
              )
            : records(
                "Users",
                data.userAudit,
                "display_name",
                [
                  { key: "is_mfa_registered", label: "MFA registered" },
                  { key: "is_admin", label: "Admin" },
                  { key: "account_enabled", label: "Enabled" },
                  { key: "last_successful_sign_in", label: "Last sign-in" },
                ],
                Boolean(client.m365_tenant_id),
              );
  const contentErrors = errors.filter(
    (error) => !["team", "client switcher", "contacts"].includes(error),
  );
  if (
    section !== "overview" &&
    (contentErrors.length ||
      (section === "contacts" && errors.includes("contacts")))
  )
    content = (
      <div className={s.empty}>
        This section’s records could not be loaded. Use Retry loading above.
      </div>
    );
  return (
    <ClientWorkspace
      key={id}
      id={id}
      name={client.name}
      domain={extractDomainFromEmail(client.primary_contact_email)}
      ownerName={data.ownerName}
      section={section}
      sub={sub}
      compose={data.compose}
      contacts={errors.includes("contacts") ? [] : data.contacts}
      clientOptions={data.clientOptions}
      sources={sources}
      actions={{
        log: actions.log,
        upload: actions.upload,
        remove: actions.remove,
      }}
      permissions={permissions}
      errors={errors}
    >
      {data.deleteError && (
        <p className={s.error} role="alert">
          {data.deleteError}
        </p>
      )}
      {content || <p className={s.empty}>This section is unavailable.</p>}
    </ClientWorkspace>
  );
}

function displayValue(key: string, value: unknown): string | number | null {
  if (value == null) return null;
  if (key === "sku_part_number") return friendlyM365SkuName(String(value));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number")
    return key.endsWith("_bytes")
      ? `${(value / 1024 ** 3).toFixed(2)} GB`
      : value;
  if (typeof value !== "string") return null;
  if (/(_at|date_time|sign_in)$/.test(key) && !Number.isNaN(Date.parse(value)))
    return formatDate(value);
  return /state|kind|risk_level/.test(key) ? humanizeLabel(value) : value;
}
function records<T extends object>(
  label: string,
  rows: T[],
  titleKey: string,
  columns: RecordColumn[],
  connected: boolean,
) {
  if (!connected)
    return (
      <div className={s.card}>
        <h3>Source not connected</h3>
        <p className={s.muted}>
          Open Connections to review this client’s mappings. No data is being
          presented as a healthy result.
        </p>
      </div>
    );
  const mapped: WorkspaceRecord[] = rows.map((item, index) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? index),
      title: String(
        displayValue(titleKey, row[titleKey]) ||
          row.user_principal_name ||
          "Unnamed record",
      ),
      subtitle:
        titleKey === "sku_part_number"
          ? String(row.sku_part_number)
          : undefined,
      values: Object.fromEntries(
        columns.map((column) => [
          column.key,
          displayValue(column.key, row[column.key]),
        ]),
      ),
      sortValues: Object.fromEntries(
        columns.map((column) => [
          column.key,
          typeof row[column.key] === "number"
            ? (row[column.key] as number)
            : row[column.key] == null
              ? null
              : String(row[column.key]),
        ]),
      ),
      details: Object.entries(row)
        .filter(([key]) => key !== "id")
        .map(([key, value]) => ({
          label: humanizeLabel(key),
          value: displayValue(key, value),
        })),
    };
  });
  const matching = (predicate: (row: Record<string, unknown>) => boolean) =>
    rows
      .filter((row) => predicate(row as Record<string, unknown>))
      .map((row) => String((row as Record<string, unknown>).id));
  const quickFilters =
    label === "Users"
      ? [
          {
            id: "no-mfa",
            label: "No MFA",
            rowIds: matching((row) => row.is_mfa_registered === false),
          },
          {
            id: "admins",
            label: "Admins",
            rowIds: matching((row) => row.is_admin === true),
          },
          {
            id: "inactive",
            label: "Inactive 90+ days",
            rowIds: matching(
              (row) =>
                row.account_enabled === true &&
                (row.last_successful_sign_in === null ||
                  Date.parse(String(row.last_successful_sign_in)) <
                    Date.now() - 90 * 86400000),
            ),
          },
        ]
      : label === "Licenses"
        ? [
            {
              id: "capacity",
              label: "At capacity",
              rowIds: matching(
                (row) =>
                  Number(row.enabled_units) > 0 &&
                  Number(row.consumed_units) >= Number(row.enabled_units),
              ),
            },
            {
              id: "unused",
              label: "Unused",
              rowIds: matching((row) => row.consumed_units === 0),
            },
          ]
        : [];
  return (
    <div className={s.stack}>
      <CGRecordTable
        key={label}
        label={label}
        rows={mapped}
        columns={columns}
        quickFilters={quickFilters}
        empty="No stored records are available. The source may not have been synced or may lack permissions for this dataset."
      />
      <p className={s.muted}>
        Cached source data. Use Refresh & connections to request an update; an
        empty result does not establish that the client is healthy.
      </p>
    </div>
  );
}
