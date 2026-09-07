"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { testForticloudConnection, type ForticloudCredentials } from "@/lib/forticloud";

export type ForticloudAccountSummary = { id: string; label: string; apiUser: string };

/** Every FortiCloud account on file — shared CG-owned ones and any
 * client-dedicated ones together, since there's no live "list every
 * account" API call to make (see forticloud.ts for why); this is purely
 * local data. */
export async function listForticloudAccountsAction(): Promise<
  { accounts: ForticloudAccountSummary[] } | { error: string }
> {
  if (!(await requirePermission("manage_integrations"))) {
    return { error: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const { data } = await admin.from("forticloud_accounts").select("id, label, api_user").order("label");
  return { accounts: (data ?? []).map((r) => ({ id: r.id, label: r.label, apiUser: r.api_user })) };
}

export type FormState = { error: string | null; success: string | null };

/** Adds one FortiCloud account (shared or a specific client's own) — a
 * plain insert, not an upsert, since this is a repeatable list rather
 * than a singleton settings row like every other integration here. */
export async function addForticloudAccountAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requirePermission("manage_integrations");
  if (!user) {
    return { error: "You don't have permission to do that.", success: null };
  }

  const label = String(formData.get("label") ?? "").trim();
  const apiUser = String(formData.get("api_user") ?? "").trim();
  const apiPassword = String(formData.get("api_password") ?? "").trim();

  if (!label || !apiUser || !apiPassword) {
    return { error: "Label, API user, and API password are all required.", success: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("forticloud_accounts").insert({
    label,
    api_user: apiUser,
    api_password: apiPassword,
    updated_by: user.id,
  });
  if (error) return { error: error.message, success: null };

  revalidatePath("/settings/integrations");
  return { error: null, success: "Account added." };
}

/** Deleting an account nulls out clients.forticloud_account_id for any
 * client that pointed at it (on delete set null) rather than blocking the
 * delete — handled entirely at the DB level. */
export async function deleteForticloudAccountAction(accountId: string): Promise<void> {
  if (!(await requirePermission("manage_integrations"))) return;
  const admin = createAdminClient();
  await admin.from("forticloud_accounts").delete().eq("id", accountId);
  revalidatePath("/settings/integrations");
}

export async function testForticloudAccountAction(accountId: string): Promise<{ ok: boolean; message: string }> {
  if (!(await requirePermission("manage_integrations"))) {
    return { ok: false, message: "You don't have permission to do that." };
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("forticloud_accounts")
    .select("api_user, api_password")
    .eq("id", accountId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Account not found." };

  const result = await testForticloudConnection({
    apiUser: row.api_user,
    apiPassword: row.api_password,
  } satisfies ForticloudCredentials);
  if (!result.ok) return { ok: false, message: result.error ?? "Connection failed." };
  return { ok: true, message: "Connected — credentials are working." };
}
