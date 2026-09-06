"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import {
  fetchSecureScoreRollup,
  fetchLicenseUtilizationRollup,
  fetchMfaGapsRollup,
  fetchInactiveAccountsRollup,
  fetchPrivilegedRolesRollup,
  fetchMailboxUsageRollup,
  type SecureScoreRollupRow,
  type LicenseUtilizationRow,
  type MfaGapRow,
  type InactiveAccountRow,
  type PrivilegedRoleRollupRow,
  type MailboxUsageRollupRow,
  type ClientLookupError,
} from "@/lib/m365-lookups";

export async function fetchSecureScoreRollupAction(): Promise<
  { rows: SecureScoreRollupRow[]; errors: ClientLookupError[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  try {
    return await fetchSecureScoreRollup(createAdminClient());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load Secure Score." };
  }
}

export async function fetchLicenseUtilizationRollupAction(): Promise<
  { rows: LicenseUtilizationRow[]; errors: ClientLookupError[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  try {
    return await fetchLicenseUtilizationRollup(createAdminClient());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load license utilization." };
  }
}

export async function fetchMfaGapsRollupAction(): Promise<
  { rows: MfaGapRow[]; errors: ClientLookupError[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  try {
    return await fetchMfaGapsRollup(createAdminClient());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load MFA status." };
  }
}

export async function fetchInactiveAccountsRollupAction(): Promise<
  { rows: InactiveAccountRow[]; errors: ClientLookupError[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  try {
    return await fetchInactiveAccountsRollup(createAdminClient());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load inactive accounts." };
  }
}

export async function fetchPrivilegedRolesRollupAction(): Promise<
  { rows: PrivilegedRoleRollupRow[]; errors: ClientLookupError[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  try {
    return await fetchPrivilegedRolesRollup(createAdminClient());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load privileged role assignments." };
  }
}

export async function fetchMailboxUsageRollupAction(): Promise<
  { rows: MailboxUsageRollupRow[]; errors: ClientLookupError[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }
  try {
    return await fetchMailboxUsageRollup(createAdminClient());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load mailbox usage." };
  }
}
