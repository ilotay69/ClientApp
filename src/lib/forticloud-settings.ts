import { createAdminClient } from "@/lib/supabase/server";
import type { ForticloudCredentials } from "@/lib/forticloud";
import { readCredential, encryptCredential } from "@/lib/crypto/credentials";

type Admin = ReturnType<typeof createAdminClient>;

const TABLE = "forticloud_accounts";

export type ForticloudAccount = { id: string; label: string; credentials: ForticloudCredentials };

type Row = {
  id: string;
  label: string;
  api_user: string | null;
  api_user_enc: string | null;
  api_password: string | null;
  api_password_enc: string | null;
};

function toAccount(r: Row): ForticloudAccount | null {
  const apiUser = readCredential(r.api_user_enc, r.api_user, { table: TABLE, column: "api_user", row: r.id });
  const apiPassword = readCredential(r.api_password_enc, r.api_password, {
    table: TABLE,
    column: "api_password",
    row: r.id,
  });
  if (!apiUser || !apiPassword) return null;
  return { id: r.id, label: r.label, credentials: { apiUser, apiPassword } };
}

const SELECT = "id, label, api_user, api_user_enc, api_password, api_password_enc";

/**
 * Every FortiCloud account on file, or just one when `accountId` is given —
 * the scoping the portal's FortiGate section does by hand. Replaces the same
 * inline query that was copied into five call sites, and is the single place
 * that knows FortiCloud credentials are (now) encrypted.
 */
export async function listForticloudAccounts(
  admin: Admin,
  accountId?: string | null
): Promise<ForticloudAccount[]> {
  let query = admin.from(TABLE).select(SELECT);
  if (accountId) query = query.eq("id", accountId);
  const { data, error } = await query;
  if (error) {
    console.error("listForticloudAccounts failed", error);
    return [];
  }
  return ((data ?? []) as Row[]).map(toAccount).filter((a): a is ForticloudAccount => a !== null);
}

export async function getForticloudAccount(admin: Admin, accountId: string): Promise<ForticloudAccount | null> {
  const { data, error } = await admin.from(TABLE).select(SELECT).eq("id", accountId).maybeSingle();
  if (error || !data) return null;
  return toAccount(data as Row);
}

/** Label + API user only, for the settings panel's list — decrypts api_user
 * but never touches api_password. */
export async function listForticloudAccountSummaries(
  admin: Admin
): Promise<{ id: string; label: string; apiUser: string }[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select("id, label, api_user, api_user_enc")
    .order("label");
  if (error) {
    console.error("listForticloudAccountSummaries failed", error);
    return [];
  }
  type SummaryRow = { id: string; label: string; api_user: string | null; api_user_enc: string | null };
  return ((data ?? []) as SummaryRow[]).map((r) => ({
    id: r.id,
    label: r.label,
    apiUser: readCredential(r.api_user_enc, r.api_user, { table: TABLE, column: "api_user", row: r.id }) ?? "",
  }));
}

/**
 * Inserts a new account, dual-writing plaintext and ciphertext. The id is
 * generated here rather than left to the column default so it can be bound
 * into each ciphertext's AAD — the encryption has to know which row a value
 * belongs to, and after-the-fact would mean an insert then an update.
 */
export async function insertForticloudAccount(
  admin: Admin,
  input: { label: string; apiUser: string; apiPassword: string; updatedBy: string }
): Promise<{ error: string | null }> {
  const id = crypto.randomUUID();
  const { error } = await admin.from(TABLE).insert({
    id,
    label: input.label,
    api_user: input.apiUser,
    api_user_enc: encryptCredential(input.apiUser, { table: TABLE, column: "api_user", row: id }),
    api_password: input.apiPassword,
    api_password_enc: encryptCredential(input.apiPassword, { table: TABLE, column: "api_password", row: id }),
    updated_by: input.updatedBy,
  });
  return { error: error?.message ?? null };
}
