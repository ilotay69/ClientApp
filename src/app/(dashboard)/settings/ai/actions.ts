"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import type { AiProvider } from "@/lib/ai";

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
  const user = await requirePermission("manage_ai_settings");
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

  revalidatePath("/settings/ai");
  return { error: null, success: "Saved." };
}

/** Marks one provider active and the other inactive — a plain two-update
 * toggle, not a DB constraint, same pattern as other simple toggles in
 * this app. */
export async function setActiveAiProvider(provider: AiProvider) {
  if (!(await requirePermission("manage_ai_settings"))) return;

  const admin = createAdminClient();
  await admin.from("ai_provider_settings").update({ is_active: false }).neq("provider", provider);
  await admin
    .from("ai_provider_settings")
    .upsert({ provider, is_active: true }, { onConflict: "provider" });

  revalidatePath("/settings/ai");
}
