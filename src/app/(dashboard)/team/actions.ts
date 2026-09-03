"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchResourceHoursSummary, type ResourceHoursRow } from "@/lib/resource-hours";
import type { UserRole } from "@/lib/types";

export async function updateMemberRole(memberId: string, role: UserRole) {
  // Guard: only someone with manage_team may change roles. RLS also
  // enforces the profiles-update side of this, but we check here too so a
  // non-permitted user gets a clear no-op instead of a silent RLS-denied
  // update.
  if (!(await requirePermission("manage_team"))) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ role }).eq("id", memberId);
  revalidatePath("/team");
}

export type AddMemberState = {
  error: string | null;
  createdPassword: string | null;
};

export async function addTeamMember(
  _prevState: AddMemberState,
  formData: FormData
): Promise<AddMemberState> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to add team members.", createdPassword: null };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "tech") as UserRole;

  if (!fullName || !email) {
    return { error: "Name and email are required.", createdPassword: null };
  }

  // 12 hex chars (~48 bits of entropy) — a temporary password the owner
  // hands to the new member out of band; not meant to be long-lived.
  const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create user.", createdPassword: null };
  }

  // The new-user trigger inserts the profile row with the default role
  // ('tech'); update it if a different role was requested.
  if (role !== "tech") {
    await admin.from("profiles").update({ role }).eq("id", created.user.id);
  }

  revalidatePath("/team");
  return { error: null, createdPassword: tempPassword };
}

/** Live from Autotask, on demand — not synced/stored anywhere, since "hours
 * worked today" is only ever meaningful as of right now, not as a cached
 * value that goes stale the moment someone logs more time. */
export async function fetchResourceHoursAction(): Promise<
  { rows: ResourceHoursRow[] } | { error: string }
> {
  if (!(await requirePermission("manage_team"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const rows = await fetchResourceHoursSummary(settings.credentials, settings.zoneUrl);
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load hours." };
  }
}
