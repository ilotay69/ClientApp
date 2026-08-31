import { AI_PROVIDER_DEFAULT_MODELS, type ActiveAiSettings, type AiProvider } from "./index";

/** Reads the currently-active AI provider's settings from the DB. Must be
 * called with the service-role admin client — ai_provider_settings has no
 * RLS policy for `authenticated`, so a request-scoped client always gets
 * zero rows back regardless of who's signed in. Returns null if no
 * provider is marked active or its key hasn't been set yet. */
export async function getActiveAiSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<ActiveAiSettings | null> {
  const { data } = await admin
    .from("ai_provider_settings")
    .select("provider, api_key, model")
    .eq("is_active", true)
    .maybeSingle();

  if (!data?.api_key) return null;

  const provider = data.provider as AiProvider;
  return {
    provider,
    apiKey: data.api_key,
    model: data.model || AI_PROVIDER_DEFAULT_MODELS[provider],
  };
}
