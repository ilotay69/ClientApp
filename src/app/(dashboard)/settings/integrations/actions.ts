"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import type { AiProvider } from "@/lib/ai";
import { resolveZoneUrl, testAutotaskConnection, type AutotaskCredentials } from "@/lib/autotask";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { testNinjaOneConnection, type NinjaOneCredentials } from "@/lib/ninjaone";
import { getNinjaOneSettings } from "@/lib/ninjaone-settings";
import { testHuduConnection, type HuduCredentials } from "@/lib/hudu";
import { getHuduSettings } from "@/lib/hudu-settings";

export type FormState = { error: string | null; success: string | null };

function emptyToUndefined(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}

/** Saves a provider's model override and, only if a non-empty value was
 * submitted, its API key — leaving an already-saved key untouched when the
 * field is left blank, so re-saving the model doesn't wipe it out. */
export async function saveAiProviderSettings(
  provider: AiProvider,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requirePermission("manage_integrations");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const apiKey = emptyToUndefined(formData.get("api_key"));
  const model = emptyToUndefined(formData.get("model")) ?? null;

  const admin = createAdminClient();
  const payload: { provider: AiProvider; model: string | null; updated_by: string; api_key?: string } = {
    provider,
    model,
    updated_by: user.id,
  };
  if (apiKey) payload.api_key = apiKey;

  const { error } = await admin
    .from("ai_provider_settings")
    .upsert(payload, { onConflict: "provider" });

  if (error) return { error: error.message, success: null };

  // First key ever saved — auto-activate it, so a fresh setup doesn't sit
  // on "not configured" waiting for a separate "Make active" click that's
  // easy to miss on first use. Only triggers when a new key was actually
  // submitted and nothing else is already active.
  if (apiKey) {
    const { data: activeRows } = await admin
      .from("ai_provider_settings")
      .select("provider")
      .eq("is_active", true)
      .limit(1);
    if (!activeRows?.length) {
      await admin.from("ai_provider_settings").update({ is_active: true }).eq("provider", provider);
    }
  }

  revalidatePath("/settings/integrations");
  return { error: null, success: "Saved." };
}

/** Marks one provider active and the other inactive — a plain two-update
 * toggle, not a DB constraint, same pattern as other simple toggles in
 * this app. */
export async function setActiveAiProvider(provider: AiProvider) {
  if (!(await requirePermission("manage_integrations"))) return;

  const admin = createAdminClient();
  await admin.from("ai_provider_settings").update({ is_active: false }).neq("provider", provider);
  await admin
    .from("ai_provider_settings")
    .upsert({ provider, is_active: true }, { onConflict: "provider" });

  revalidatePath("/settings/integrations");
}

/** Upserts the singleton Autotask credentials row and resolves+caches the
 * tenant's zone URL on save, so later calls don't need to re-resolve it
 * every time. Secret is write-only, same pattern as the AI provider keys —
 * leaving it blank keeps whatever is already saved. */
export async function saveAutotaskSettings(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requirePermission("manage_integrations");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const username = String(formData.get("username") ?? "").trim();
  const integrationCode = String(formData.get("integration_code") ?? "").trim();
  const secret = emptyToUndefined(formData.get("secret"));

  if (!username || !integrationCode) {
    return { error: "Username and Integration Code are required.", success: null };
  }

  const admin = createAdminClient();
  const existing = await getAutotaskSettings(admin);
  const effectiveSecret = secret ?? existing?.credentials.secret;
  if (!effectiveSecret) {
    return { error: "A Secret is required for first-time setup.", success: null };
  }

  let zoneUrl: string;
  let webZoneUrl: string;
  try {
    ({ zoneUrl, webUrl: webZoneUrl } = await resolveZoneUrl(username));
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to resolve Autotask zone.",
      success: null,
    };
  }

  const payload: {
    id: true;
    username: string;
    integration_code: string;
    zone_url: string;
    web_zone_url: string;
    updated_by: string;
    secret?: string;
  } = {
    id: true,
    username,
    integration_code: integrationCode,
    zone_url: zoneUrl,
    web_zone_url: webZoneUrl,
    updated_by: user.id,
  };
  if (secret) payload.secret = secret;

  const { error } = await admin.from("autotask_settings").upsert(payload, { onConflict: "id" });
  if (error) return { error: error.message, success: null };

  revalidatePath("/settings/integrations");
  return { error: null, success: "Saved." };
}

/** Tests the currently-saved Autotask credentials — doesn't persist
 * anything, just reports whether they work. */
export async function testAutotaskConnectionAction(): Promise<{ ok: boolean; message: string }> {
  if (!(await requirePermission("manage_integrations"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings) {
    return { ok: false, message: "Save your Autotask credentials first." };
  }

  const result = await testAutotaskConnection(settings.credentials satisfies AutotaskCredentials);
  if (!result.ok) return { ok: false, message: result.error ?? "Connection failed." };

  if (result.zoneUrl && (result.zoneUrl !== settings.zoneUrl || result.webUrl !== settings.webZoneUrl)) {
    await admin
      .from("autotask_settings")
      .update({ zone_url: result.zoneUrl, web_zone_url: result.webUrl })
      .eq("id", true);
  }

  return { ok: true, message: "Connected — credentials are working." };
}

/** Upserts the singleton NinjaOne credentials row. Secret is write-only,
 * same pattern as Autotask/AI keys — leaving it blank keeps whatever is
 * already saved. Doesn't pre-fetch a token here (unlike Autotask's zone
 * resolution, there's nothing to resolve up front) — that happens lazily
 * on first real use, or explicitly via "Test connection". */
export async function saveNinjaOneSettings(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requirePermission("manage_integrations");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const region = String(formData.get("region") ?? "").trim();
  const clientId = String(formData.get("client_id") ?? "").trim();
  const secret = emptyToUndefined(formData.get("client_secret"));

  if (!region || !clientId) {
    return { error: "Region and Client ID are required.", success: null };
  }

  const admin = createAdminClient();
  const existing = await getNinjaOneSettings(admin);
  const effectiveSecret = secret ?? existing?.credentials.clientSecret;
  if (!effectiveSecret) {
    return { error: "A Client Secret is required for first-time setup.", success: null };
  }

  const payload: {
    id: true;
    region: string;
    client_id: string;
    updated_by: string;
    client_secret?: string;
    // Changing credentials invalidates any cached token.
    cached_access_token: null;
    token_expires_at: null;
  } = {
    id: true,
    region,
    client_id: clientId,
    updated_by: user.id,
    cached_access_token: null,
    token_expires_at: null,
  };
  if (secret) payload.client_secret = secret;

  const { error } = await admin.from("ninjaone_settings").upsert(payload, { onConflict: "id" });
  if (error) return { error: error.message, success: null };

  revalidatePath("/settings/integrations");
  return { error: null, success: "Saved." };
}

/** Tests the currently-saved NinjaOne credentials — doesn't persist
 * anything, just reports whether they work. */
export async function testNinjaOneConnectionAction(): Promise<{ ok: boolean; message: string }> {
  if (!(await requirePermission("manage_integrations"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getNinjaOneSettings(admin);
  if (!settings) {
    return { ok: false, message: "Save your NinjaOne credentials first." };
  }

  const result = await testNinjaOneConnection(settings.credentials satisfies NinjaOneCredentials);
  if (!result.ok) return { ok: false, message: result.error ?? "Connection failed." };
  return { ok: true, message: "Connected — credentials are working." };
}

export async function saveHuduSettings(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requirePermission("manage_integrations");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const baseUrl = String(formData.get("base_url") ?? "").trim();
  const apiKey = emptyToUndefined(formData.get("api_key"));

  if (!baseUrl) {
    return { error: "Hudu URL is required.", success: null };
  }

  const admin = createAdminClient();
  const existing = await getHuduSettings(admin);
  const effectiveApiKey = apiKey ?? existing?.apiKey;
  if (!effectiveApiKey) {
    return { error: "An API key is required for first-time setup.", success: null };
  }

  const payload: { id: true; base_url: string; updated_by: string; api_key?: string } = {
    id: true,
    base_url: baseUrl,
    updated_by: user.id,
  };
  if (apiKey) payload.api_key = apiKey;

  const { error } = await admin.from("hudu_settings").upsert(payload, { onConflict: "id" });
  if (error) return { error: error.message, success: null };

  revalidatePath("/settings/integrations");
  return { error: null, success: "Saved." };
}

/** Tests the currently-saved Hudu credentials — doesn't persist anything,
 * just reports whether they work. */
export async function testHuduConnectionAction(): Promise<{ ok: boolean; message: string }> {
  if (!(await requirePermission("manage_integrations"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getHuduSettings(admin);
  if (!settings) {
    return { ok: false, message: "Save your Hudu credentials first." };
  }

  const result = await testHuduConnection(settings satisfies HuduCredentials);
  if (!result.ok) return { ok: false, message: result.error ?? "Connection failed." };
  return { ok: true, message: "Connected — credentials are working." };
}

export async function saveSalesNotificationSettings(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requirePermission("manage_integrations");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const repEmail = emptyToUndefined(formData.get("rep_email")) ?? null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("sales_notification_settings")
    .upsert({ id: true, rep_email: repEmail, updated_by: user.id }, { onConflict: "id" });

  if (error) return { error: error.message, success: null };

  revalidatePath("/settings/integrations");
  return { error: null, success: "Saved." };
}
