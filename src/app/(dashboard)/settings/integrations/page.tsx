import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { AI_PROVIDER_LABELS, AI_PROVIDER_DEFAULT_MODELS, type AiProvider } from "@/lib/ai";
import { AiProviderSettingsForm } from "@/components/ai-provider-settings-form";
import { AutotaskSettingsForm } from "@/components/autotask-settings-form";
import { NinjaOneSettingsForm } from "@/components/ninjaone-settings-form";
import { HuduSettingsForm } from "@/components/hudu-settings-form";
import { HuntressSettingsForm } from "@/components/huntress-settings-form";
import { BitdefenderSettingsForm } from "@/components/bitdefender-settings-form";
import { WizerSettingsForm } from "@/components/wizer-settings-form";
import { NordLayerSettingsForm } from "@/components/nordlayer-settings-form";
import { NordPassSettingsForm } from "@/components/nordpass-settings-form";
import { ForticloudAccountsPanel } from "@/components/forticloud-accounts-panel";
import { SalesNotificationSettingsForm } from "@/components/sales-notification-settings-form";
import { SharedMailboxSettingsForm } from "@/components/shared-mailbox-settings-form";
import { QuarterlyReviewReminderSettingsForm } from "@/components/quarterly-review-reminder-settings-form";
import { EmailTemplateForm } from "@/components/email-template-form";
import { BlockHoursReportSubscriptionsPanel } from "@/components/block-hours-report-subscriptions-panel";
import { ClientMappingTable, type ClientMappingRow } from "@/components/client-mapping-table";
import { GroupedTabs } from "@/components/grouped-tabs";
import {
  searchNinjaOneOrganizationsAction,
  linkClientNinjaOneOrganization,
  unlinkClientNinjaOneOrganization,
  saveM365ClientCredentialsAction,
  testM365ClientConnectionAction,
  unlinkClientM365Tenant,
  searchHuntressOrganizationsAction,
  linkClientHuntressOrganization,
  unlinkClientHuntressOrganization,
} from "@/app/(dashboard)/clients/actions";
import { EMAIL_TEMPLATES, getEmailTemplate } from "@/lib/email-templates";
import {
  saveAiProviderSettings,
  setActiveAiProvider,
  saveAutotaskSettings,
  testAutotaskConnectionAction,
  saveNinjaOneSettings,
  testNinjaOneConnectionAction,
  saveHuduSettings,
  testHuduConnectionAction,
  saveHuntressSettings,
  testHuntressConnectionAction,
  saveBitdefenderSettings,
  testBitdefenderConnectionAction,
  saveWizerSettings,
  testWizerConnectionAction,
  saveNordLayerSettings,
  testNordLayerConnectionAction,
  saveNordPassSettings,
  saveSalesNotificationSettings,
  testSharedMailboxConnectionAction,
  syncSharedMailboxNowAction,
  saveQuarterlyReviewReminderSettings,
  saveEmailTemplateAction,
  addBlockHoursReportSubscriptionAction,
  removeBlockHoursReportSubscriptionAction,
  saveBlockHoursReportCcAction,
  sendBlockHoursUsageReportsNowAction,
  sendBlockHoursUsageReportsToSelectedAction,
  fetchBlockHoursCandidatesAction,
  addBlockHoursReportSubscriptionsAction,
} from "./actions";
import {
  listForticloudAccountsAction,
  addForticloudAccountAction,
  deleteForticloudAccountAction,
  testForticloudAccountAction,
} from "./forticloud-actions";

export const dynamic = "force-dynamic";

const PROVIDERS: AiProvider[] = ["anthropic", "openai"];

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_integrations"))) {
    redirect("/dashboard");
  }

  // Admin client — these tables have no RLS policy for authenticated users
  // at all, so a request-scoped client would always get zero rows back.
  const admin = createAdminClient();
  const [
    { data: rows },
    { data: autotaskRow },
    { data: ninjaOneRow },
    { data: huduRow },
    { data: huntressRow },
    { data: bitdefenderRow },
    { data: wizerRow },
    { data: nordLayerRow },
    { data: nordPassRow },
    { data: salesNotifyRow },
    { data: sharedMailboxRow },
    { data: reviewReminderRow },
    quarterlyReviewEmailTemplate,
    contractUsageEmailTemplate,
    { data: blockHoursSubscriptionRows },
    { data: autotaskClientsForBlockHours },
    { data: blockHoursReportSettingsRow },
    { data: mappingClientRows },
    { data: m365CredentialRows },
  ] = await Promise.all([
    admin.from("ai_provider_settings").select("provider, model, is_active, api_key"),
    admin
      .from("autotask_settings")
      .select("username, secret, integration_code, zone_url")
      .eq("id", true)
      .maybeSingle(),
    admin
      .from("ninjaone_settings")
      .select("region, client_id, client_secret")
      .eq("id", true)
      .maybeSingle(),
    admin.from("hudu_settings").select("base_url, api_key").eq("id", true).maybeSingle(),
    admin.from("huntress_settings").select("api_key, api_secret").eq("id", true).maybeSingle(),
    admin.from("bitdefender_settings").select("region, api_key").eq("id", true).maybeSingle(),
    admin.from("wizer_settings").select("api_key").eq("id", true).maybeSingle(),
    admin.from("nordlayer_settings").select("api_key").eq("id", true).maybeSingle(),
    admin.from("nordpass_settings").select("private_key").eq("id", true).maybeSingle(),
    admin.from("sales_notification_settings").select("rep_email").eq("id", true).maybeSingle(),
    admin
      .from("shared_mailbox_settings")
      .select("last_synced_at, last_sync_error, last_sync_error_at")
      .eq("id", true)
      .maybeSingle(),
    admin
      .from("quarterly_review_reminder_settings")
      .select("approver_email, reminder_interval_days")
      .eq("id", true)
      .maybeSingle(),
    getEmailTemplate(admin, "quarterly_review"),
    getEmailTemplate(admin, "contract_usage_report"),
    admin
      .from("block_hours_report_subscriptions")
      .select("id, to_email, clients(id, name)")
      .order("created_at", { ascending: true }),
    admin
      .from("clients")
      .select("id, name, email:primary_contact_email")
      .not("autotask_company_id", "is", null)
      .order("name"),
    admin.from("block_hours_report_settings").select("cc_email").eq("id", true).maybeSingle(),
    // Every client, not just Autotask-linked ones — a client with no
    // NinjaOne/365 mapping yet is precisely what the Client Mapping tab
    // exists to surface, so filtering any of them out would hide the work.
    admin
      .from("clients")
      .select("id, name, ninjaone_organization_id, m365_tenant_id, huntress_organization_id")
      .order("name"),
    // m365_client_credentials is service-role only and keyed by client_id,
    // so credential presence can't come from the clients select above.
    // app_client_id only (never the secret) — the form just needs to show
    // which id is on file so someone can tell whether it's the right one.
    admin.from("m365_client_credentials").select("client_id, app_client_id"),
  ]);

  type ProviderRow = {
    provider: AiProvider;
    model: string | null;
    is_active: boolean;
    api_key: string | null;
  };
  const byProvider = new Map<AiProvider, ProviderRow>(
    (rows ?? []).map((r: ProviderRow) => [r.provider, r] as const)
  );

  type BlockHoursSubscriptionRow = {
    id: string;
    to_email: string;
    clients: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const blockHoursSubscriptions = ((blockHoursSubscriptionRows ?? []) as BlockHoursSubscriptionRow[]).map((r) => {
    const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    return {
      id: r.id,
      clientId: client?.id ?? "",
      clientName: client?.name ?? "Unknown client",
      toEmail: r.to_email,
    };
  });

  type MappingClientRow = {
    id: string;
    name: string;
    ninjaone_organization_id: number | null;
    m365_tenant_id: string | null;
    huntress_organization_id: number | null;
  };
  const m365AppClientIdByClientId = new Map<string, string | null>(
    ((m365CredentialRows ?? []) as { client_id: string; app_client_id: string | null }[]).map((r) => [
      r.client_id,
      r.app_client_id,
    ])
  );
  const clientMappingRows: ClientMappingRow[] = ((mappingClientRows ?? []) as MappingClientRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    ninjaoneOrganizationId: c.ninjaone_organization_id,
    m365TenantId: c.m365_tenant_id,
    hasM365Credentials: Boolean(m365AppClientIdByClientId.get(c.id)),
    m365AppClientId: m365AppClientIdByClientId.get(c.id) ?? null,
    huntressOrganizationId: c.huntress_organization_id,
  }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect the AI provider that powers the dashboard&apos;s Insights
          feed, and external tools like Autotask. Each client&apos;s own
          NinjaOne organization and Microsoft 365 tenant are linked under
          Client Mapping.
        </p>
      </div>

      {connected && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Connected successfully.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {decodeURIComponent(error)}
        </div>
      )}

      <GroupedTabs
        groups={[
          {
            group: "Core Tools",
            tabs: [
              {
                label: "AI Providers",
                content: (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {PROVIDERS.map((provider) => {
                      const row = byProvider.get(provider);
                      return (
                        <AiProviderSettingsForm
                          key={provider}
                          provider={provider}
                          label={AI_PROVIDER_LABELS[provider]}
                          defaultModel={AI_PROVIDER_DEFAULT_MODELS[provider]}
                          hasKey={Boolean(row?.api_key)}
                          isActive={Boolean(row?.is_active)}
                          currentModel={row?.model ?? null}
                          saveAction={saveAiProviderSettings.bind(null, provider)}
                          activateAction={setActiveAiProvider}
                        />
                      );
                    })}
                  </div>
                ),
              },
              {
                label: "Autotask",
                content: (
                  <AutotaskSettingsForm
                    hasCredentials={Boolean(autotaskRow?.username && autotaskRow?.secret)}
                    zoneUrl={autotaskRow?.zone_url ?? null}
                    currentUsername={autotaskRow?.username ?? null}
                    currentIntegrationCode={autotaskRow?.integration_code ?? null}
                    saveAction={saveAutotaskSettings}
                    testAction={testAutotaskConnectionAction}
                  />
                ),
              },
              {
                label: "NinjaOne",
                content: (
                  <NinjaOneSettingsForm
                    hasCredentials={Boolean(ninjaOneRow?.client_id && ninjaOneRow?.client_secret)}
                    currentRegion={ninjaOneRow?.region ?? null}
                    currentClientId={ninjaOneRow?.client_id ?? null}
                    saveAction={saveNinjaOneSettings}
                    testAction={testNinjaOneConnectionAction}
                  />
                ),
              },
              {
                label: "Hudu",
                content: (
                  <HuduSettingsForm
                    hasCredentials={Boolean(huduRow?.base_url && huduRow?.api_key)}
                    currentBaseUrl={huduRow?.base_url ?? null}
                    saveAction={saveHuduSettings}
                    testAction={testHuduConnectionAction}
                  />
                ),
              },
              {
                label: "Shared Mailbox",
                content: (
                  <SharedMailboxSettingsForm
                    mailboxEmail={process.env.SHARED_MAILBOX_EMAIL ?? null}
                    lastSyncedAt={sharedMailboxRow?.last_synced_at ?? null}
                    lastSyncError={sharedMailboxRow?.last_sync_error ?? null}
                    lastSyncErrorAt={sharedMailboxRow?.last_sync_error_at ?? null}
                    testAction={testSharedMailboxConnectionAction}
                    syncAction={syncSharedMailboxNowAction}
                  />
                ),
              },
            ],
          },
          {
            group: "Client Mapping",
            tabs: [
              {
                label: "NinjaOne, 365 & Huntress",
                content: (
                  <ClientMappingTable
                    rows={clientMappingRows}
                    searchNinjaOneAction={searchNinjaOneOrganizationsAction}
                    linkNinjaOneAction={linkClientNinjaOneOrganization}
                    unlinkNinjaOneAction={unlinkClientNinjaOneOrganization}
                    saveM365Action={saveM365ClientCredentialsAction}
                    testM365Action={testM365ClientConnectionAction}
                    unlinkM365Action={unlinkClientM365Tenant}
                    searchHuntressAction={searchHuntressOrganizationsAction}
                    linkHuntressAction={linkClientHuntressOrganization}
                    unlinkHuntressAction={unlinkClientHuntressOrganization}
                  />
                ),
              },
            ],
          },
          {
            group: "Security Vendors",
            tabs: [
              {
                label: "Huntress",
                content: (
                  <HuntressSettingsForm
                    hasCredentials={Boolean(huntressRow?.api_key && huntressRow?.api_secret)}
                    saveAction={saveHuntressSettings}
                    testAction={testHuntressConnectionAction}
                  />
                ),
              },
              {
                label: "Bitdefender GravityZone",
                content: (
                  <BitdefenderSettingsForm
                    hasCredentials={Boolean(bitdefenderRow?.api_key)}
                    currentRegion={bitdefenderRow?.region ?? null}
                    saveAction={saveBitdefenderSettings}
                    testAction={testBitdefenderConnectionAction}
                  />
                ),
              },
              {
                label: "Wizer",
                content: (
                  <WizerSettingsForm
                    hasCredentials={Boolean(wizerRow?.api_key)}
                    saveAction={saveWizerSettings}
                    testAction={testWizerConnectionAction}
                  />
                ),
              },
              {
                label: "NordLayer",
                content: (
                  <NordLayerSettingsForm
                    hasCredentials={Boolean(nordLayerRow?.api_key)}
                    saveAction={saveNordLayerSettings}
                    testAction={testNordLayerConnectionAction}
                  />
                ),
              },
              {
                label: "NordPass Business",
                content: (
                  <NordPassSettingsForm
                    hasCredentials={Boolean(nordPassRow?.private_key)}
                    saveAction={saveNordPassSettings}
                  />
                ),
              },
              {
                label: "FortiCloud",
                content: (
                  <ForticloudAccountsPanel
                    listAction={listForticloudAccountsAction}
                    addAction={addForticloudAccountAction}
                    deleteAction={deleteForticloudAccountAction}
                    testAction={testForticloudAccountAction}
                  />
                ),
              },
            ],
          },
          {
            group: "Notifications",
            tabs: [
              {
                label: "Internal Sales",
                content: (
                  <SalesNotificationSettingsForm
                    currentRepEmail={salesNotifyRow?.rep_email ?? null}
                    saveAction={saveSalesNotificationSettings}
                  />
                ),
              },
              {
                label: "Quarterly Review Reminders",
                content: (
                  <QuarterlyReviewReminderSettingsForm
                    currentApproverEmail={reviewReminderRow?.approver_email ?? "ilotay@cgtechnologies.com"}
                    currentIntervalDays={reviewReminderRow?.reminder_interval_days ?? 7}
                    saveAction={saveQuarterlyReviewReminderSettings}
                  />
                ),
              },
              {
                label: "Block of Hours Usage Report",
                content: (
                  <BlockHoursReportSubscriptionsPanel
                    subscriptions={blockHoursSubscriptions}
                    clients={autotaskClientsForBlockHours ?? []}
                    currentCcEmail={blockHoursReportSettingsRow?.cc_email ?? null}
                    addAction={addBlockHoursReportSubscriptionAction}
                    removeAction={removeBlockHoursReportSubscriptionAction}
                    saveCcAction={saveBlockHoursReportCcAction}
                    sendNowAction={sendBlockHoursUsageReportsNowAction}
                    sendToSelectedAction={sendBlockHoursUsageReportsToSelectedAction}
                    fetchCandidatesAction={fetchBlockHoursCandidatesAction}
                    addManyAction={addBlockHoursReportSubscriptionsAction}
                  />
                ),
              },
            ],
          },
          {
            group: "Email Templates",
            tabs: [
              {
                label: EMAIL_TEMPLATES[0].label,
                content: (
                  <EmailTemplateForm
                    templateKey={EMAIL_TEMPLATES[0].key}
                    label={EMAIL_TEMPLATES[0].label}
                    description={EMAIL_TEMPLATES[0].description}
                    placeholders={EMAIL_TEMPLATES[0].placeholders}
                    currentSubject={quarterlyReviewEmailTemplate.subject}
                    currentIntro={quarterlyReviewEmailTemplate.intro}
                    noteLabel={EMAIL_TEMPLATES[0].noteLabel}
                    noteDescription={EMAIL_TEMPLATES[0].noteDescription}
                    currentNote={quarterlyReviewEmailTemplate.note}
                    saveAction={saveEmailTemplateAction}
                  />
                ),
              },
              {
                label: EMAIL_TEMPLATES[1].label,
                content: (
                  <EmailTemplateForm
                    templateKey={EMAIL_TEMPLATES[1].key}
                    label={EMAIL_TEMPLATES[1].label}
                    description={EMAIL_TEMPLATES[1].description}
                    placeholders={EMAIL_TEMPLATES[1].placeholders}
                    currentSubject={contractUsageEmailTemplate.subject}
                    currentIntro={contractUsageEmailTemplate.intro}
                    noteLabel={EMAIL_TEMPLATES[1].noteLabel}
                    noteDescription={EMAIL_TEMPLATES[1].noteDescription}
                    currentNote={contractUsageEmailTemplate.note}
                    saveAction={saveEmailTemplateAction}
                  />
                ),
              },
            ],
          },
        ]}
      />
    </div>
  );
}
