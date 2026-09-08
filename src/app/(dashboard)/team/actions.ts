"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission, isStaffRole } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

export async function updateMemberRole(memberId: string, role: UserRole) {
  // Guard: only someone with manage_team may change roles. RLS also
  // enforces the profiles-update side of this, but we check here too so a
  // non-permitted user gets a clear no-op instead of a silent RLS-denied
  // update.
  if (!(await requirePermission("manage_team"))) return;

  // `role` is a Server Action argument — the UserRole type is a compile-time
  // claim about it, not a runtime one, so an arbitrary string can arrive here.
  // Two things this stops now that 'client' is a real enum value: turning a
  // staff member into a portal user (which would strand them with no
  // client_id), and the reverse — promoting a customer's login to staff.
  if (!isStaffRole(role)) return;

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
  if (!isStaffRole(role)) {
    return { error: "Pick a staff role.", createdPassword: null };
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
    // The role travels in app_metadata, which only the admin API can set —
    // unlike user_metadata, which is caller-supplied at signup and
    // self-rewritable afterwards via auth.updateUser({data}). The new-user
    // trigger (supabase/063) reads it and the profile is *born* with the right
    // role, so there's no longer a window where a failed follow-up UPDATE
    // leaves someone holding a role nobody chose. It's also what tells the
    // trigger this account was deliberately provisioned, which is how a staff
    // member on a non-CG email address gets in at all now.
    app_metadata: { staff_role: role },
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create user.", createdPassword: null };
  }

  revalidatePath("/team");
  return { error: null, createdPassword: tempPassword };
}
