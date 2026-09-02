import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { AI_PROVIDER_LABELS, AI_PROVIDER_DEFAULT_MODELS, type AiProvider } from "@/lib/ai";
import { AiProviderSettingsForm } from "@/components/ai-provider-settings-form";
import { AutotaskSettingsForm } from "@/components/autotask-settings-form";
import { NinjaOneSettingsForm } from "@/components/ninjaone-settings-form";
import { M365PartnerSettingsForm } from "@/components/m365-partner-settings-form";
import { Tabs } from "@/components/tabs";
import {
  saveAiProviderSettings,
  setActiveAiProvider,
  saveAutotaskSettings,
  testAutotaskConnectionAction,
  saveNinjaOneSettings,
  testNinjaOneConnectionAction,
  saveM365PartnerSettings,
} from "./actions";

export const dynamic = "force-dynamic";

const PROVIDERS: AiProvider[] = ["anthropic", "openai"];

export default async function IntegrationsSettingsPage() {
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_integrations"))) {
    redirect("/dashboard");
  }

  // Admin client — these tables have no RLS policy for authenticated users
  // at all, so a request-scoped client would always get zero rows back.
  const admin = createAdminClient();
  const [{ data: rows }, { data: autotaskRow }, { data: ninjaOneRow }, { data: m365Row }] = await Promise.all([
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
    admin
      .from("m365_partner_settings")
      .select("partner_tenant_id, client_id, client_secret, cached_refresh_token, obo_user_hint, connected_at")
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
          feed, and external tools like Autotask.
        </p>
      </div>

      <Tabs
        tabs={[
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
            label: "Microsoft 365 (Partner)",
            content: (
              <M365PartnerSettingsForm
                hasCredentials={Boolean(m365Row?.client_id && m365Row?.client_secret)}
                isConnected={Boolean(m365Row?.cached_refresh_token)}
                oboUserHint={m365Row?.obo_user_hint ?? null}
                connectedAt={m365Row?.connected_at ?? null}
                currentPartnerTenantId={m365Row?.partner_tenant_id ?? null}
                currentClientId={m365Row?.client_id ?? null}
                saveAction={saveM365PartnerSettings}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
