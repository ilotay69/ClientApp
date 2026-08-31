import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { AI_PROVIDER_LABELS, AI_PROVIDER_DEFAULT_MODELS, type AiProvider } from "@/lib/ai";
import { AiProviderSettingsForm } from "@/components/ai-provider-settings-form";
import { saveAiProviderSettings, setActiveAiProvider } from "./actions";

export const dynamic = "force-dynamic";

const PROVIDERS: AiProvider[] = ["anthropic", "openai"];

export default async function AiSettingsPage() {
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "manage_ai_settings"))) {
    redirect("/dashboard");
  }

  // Admin client — this table has no RLS policy for authenticated users at
  // all, so a request-scoped client would always get zero rows back.
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("ai_provider_settings")
    .select("provider, model, is_active, api_key");

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
        <h1 className="text-2xl font-semibold text-slate-900">AI Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick which AI provider powers the dashboard&apos;s Insights feed,
          and add its API key. Only one provider is active at a time.
        </p>
      </div>

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
    </div>
  );
}
