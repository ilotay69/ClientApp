"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getResendClient, buildPortalPasswordResetEmail } from "@/lib/resend";

export type PortalUserRow = {
  id: string;
  fullName: string;
  email: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  /** Whether they've finished setting up an authenticator. */
  mfaEnrolled: boolean;
  lastSignInAt: string | null;
};

export type CreatePortalUserState = {
  error: string | null;
  createdPassword: string | null;
  createdEmail: string | null;
};

export async function listPortalUsers(): Promise<PortalUserRow[]> {
  if (!(await requirePermission("manage_client_access"))) return [];

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, email, created_at, client_id")
    .eq("role", "client")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listPortalUsers failed", error);
    return [];
  }

  type ProfileRow = {
    id: string;
    full_name: string;
    email: string;
    created_at: string;
    client_id: string;
  };
  const rows0 = (profiles ?? []) as ProfileRow[];

  // A plain second query rather than PostgREST's embedded-resource syntax
  // (`.select("...client_id, clients(name)")`) — that syntax depends on
  // PostgREST having reloaded its schema cache after profiles.client_id's
  // foreign key was added (064), which isn't guaranteed right after running a
  // migration by hand in the SQL editor. Matches how the rest of this
  // codebase already joins across tables (e.g. contract-hours.ts).
  const clientIds = [...new Set(rows0.map((p) => p.client_id).filter(Boolean))];
  const { data: clients } =
    clientIds.length > 0
      ? await admin.from("clients").select("id, name").in("id", clientIds)
      : { data: [] as { id: string; name: string }[] };
  const clientNameById = new Map(
    ((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );

  // MFA status and last sign-in live on the auth user, not the profile, so
  // they have to be read per user through the admin API.
  const rows = await Promise.all(
    rows0.map(async (p: ProfileRow): Promise<PortalUserRow> => {
      let mfaEnrolled = false;
      let lastSignInAt: string | null = null;
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(p.id);
        lastSignInAt = authUser?.user?.last_sign_in_at ?? null;
        mfaEnrolled = (authUser?.user?.factors ?? []).some(
          (f) => f.status === "verified"
        );
      } catch (err) {
        console.error(`listPortalUsers: could not read auth user ${p.id}`, err);
      }

      return {
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        clientId: p.client_id,
        clientName: clientNameById.get(p.client_id) ?? "Unknown client",
        createdAt: p.created_at,
        mfaEnrolled,
        lastSignInAt,
      };
    })
  );

  return rows;
}

export async function createPortalUser(
  _prevState: CreatePortalUserState,
  formData: FormData
): Promise<CreatePortalUserState> {
  const fail = (error: string): CreatePortalUserState => ({
    error,
    createdPassword: null,
    createdEmail: null,
  });

  if (!(await requirePermission("manage_client_access"))) {
    return fail("You don't have permission to create portal logins.");
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const clientId = String(formData.get("client_id") ?? "").trim();

  if (!fullName || !email || !clientId) {
    return fail("Name, email and client are all required.");
  }

  const admin = createAdminClient();

  // Confirm the client exists before minting anything. The database checks
  // this too (handle_new_user raises on an unknown portal_client_id), but a
  // clear message beats a Postgres error surfacing in the UI.
  const { data: client } = await admin
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return fail("That client no longer exists.");

  // handle_new_user() (the trigger on auth.users) decides the new profile's
  // role and client_id — but the `app_metadata` parameter passed to
  // createUser() below does NOT reliably reach raw_app_meta_data in this
  // project: confirmed via Postgres Logs that it arrives containing only
  // GoTrue's own provider/providers fields, nothing the app passed in. This
  // table (supabase/067) is the reliable replacement — the trigger reads it
  // by email instead, and removes its own row once consumed.
  const { error: pendingError } = await admin
    .from("pending_account_provisions")
    .upsert({ email, client_id: clientId, staff_role: null });
  if (pendingError) {
    console.error("createPortalUser: failed to stage pending provision", pendingError);
    return fail("Could not create the portal login.");
  }

  // 16 hex chars (~64 bits). Handed over out of band, then replaced by the
  // client the first time they sign in.
  const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    // Best-effort cleanup — otherwise the row sits until a future attempt for
    // this same email overwrites it, which is harmless but confusing.
    await admin.from("pending_account_provisions").delete().eq("email", email);
    return fail(createError?.message ?? "Could not create the portal login.");
  }

  // A temp password should never be a standing credential, whether it's
  // shown here for staff to relay or emailed via sendPortalPasswordReset —
  // the portal forces a real password before anything else on next sign-in.
  await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", created.user.id);

  revalidatePath("/team/client-access");
  return { error: null, createdPassword: tempPassword, createdEmail: email };
}

/** Mints a new temp password and emails it directly — replaces the old
 * Supabase "resetPasswordForEmail" magic link, which depended on the
 * recovery link's redirectTo exactly matching Supabase's allow-listed
 * Redirect URLs (drifted every time the app moved domains, and gave no
 * visibility when it silently failed to land the recipient anywhere).
 *
 * Sets the password directly through the admin API — no email link, no
 * code exchange, nothing that can point at a stale domain. must_change_password
 * forces a real password before the login can reach anything else, so the
 * temp value emailed here is never a standing credential. */
export async function sendPortalPasswordReset(
  userId: string
): Promise<{ error?: string; sent?: boolean }> {
  if (!(await requirePermission("manage_client_access"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.role !== "client") return { error: "Not a portal login." };

  const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });
  if (updateError) {
    console.error("sendPortalPasswordReset: password update failed", updateError);
    return { error: updateError.message };
  }

  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);

  try {
    const resend = getResendClient();
    const fromAddress =
      process.env.REMINDERS_FROM_EMAIL ?? "CG Ops <reminders@example.com>";
    const { html, text } = buildPortalPasswordResetEmail(profile.full_name, tempPassword);
    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: profile.email,
      subject: "Your CG Technologies client portal password was reset",
      html,
      text,
    });
    if (sendError) {
      console.error("sendPortalPasswordReset: Resend rejected the email", sendError);
      return { error: "Password was reset, but the email couldn't be sent — check Resend settings." };
    }
  } catch (err) {
    console.error("sendPortalPasswordReset: email send failed", err);
    return {
      error:
        err instanceof Error
          ? `Password was reset, but the email failed: ${err.message}`
          : "Password was reset, but the email couldn't be sent.",
    };
  }

  return { sent: true };
}

/** Clears a portal login's authenticator so they can enrol a new one.
 *
 * Without this, a lost or wiped phone locks a client out permanently — MFA is
 * mandatory for portal logins and there is no self-service recovery. Treat it
 * like a password reset: confirm who is asking before using it. */
export async function resetPortalUserMfa(
  userId: string
): Promise<{ error?: string; reset?: boolean }> {
  if (!(await requirePermission("manage_client_access"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.role !== "client") return { error: "Not a portal login." };

  try {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    for (const factor of authUser?.user?.factors ?? []) {
      await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
    }
  } catch (err) {
    console.error("resetPortalUserMfa failed", err);
    return { error: err instanceof Error ? err.message : "Could not reset the authenticator." };
  }

  revalidatePath("/team/client-access");
  return { reset: true };
}

/** Deletes the auth user, which cascades the profile away with it.
 *
 * This is the only credential-revocation path in the app: before this, a
 * created login could never actually be taken away. */
export async function removePortalUser(
  userId: string
): Promise<{ error?: string; removed?: boolean }> {
  if (!(await requirePermission("manage_client_access"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  // Refuse anything that isn't a portal login, so this can never be turned
  // into a way to delete a colleague.
  if (!profile || profile.role !== "client") return { error: "Not a portal login." };

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("removePortalUser failed", error);
    return { error: error.message };
  }

  revalidatePath("/team/client-access");
  return { removed: true };
}
