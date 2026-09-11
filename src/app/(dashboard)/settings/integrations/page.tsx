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
import { GroupedTabs } from "@/components/grouped-tabs";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect the AI provider that powers the dashboard&apos;s Insights
          feed, and external tools like Autotask. Microsoft 365 is
          configured per client, from each client&apos;s own page — every
          client has its own app registration and credentials.
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
                label: "Recruitment Mailbox",
                content: (
                  <SharedMailboxSettingsForm
                    mailboxEmail={process.env.RECRUITMENT_MAILBOX_EMAIL ?? null}
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
            ],
          },
        ]}
      />
    </div>
  );
}
