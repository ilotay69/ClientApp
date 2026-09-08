"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { resolveAppUrl } from "@/lib/app-url";

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
    .select("id, full_name, email, created_at, client_id, clients(name)")
    .eq("role", "client")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listPortalUsers failed", error);
    return [];
  }

  // MFA status and last sign-in live on the auth user, not the profile, so
  // they have to be read per user through the admin API.
  const rows = await Promise.all(
    (profiles ?? []).map(async (p: {
      id: string;
      full_name: string;
      email: string;
      created_at: string;
      client_id: string;
      clients: { name: string } | { name: string }[] | null;
    }): Promise<PortalUserRow> => {
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

      const client = Array.isArray(p.clients) ? p.clients[0] : p.clients;
      return {
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        clientId: p.client_id,
        clientName: client?.name ?? "Unknown client",
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

  // 16 hex chars (~64 bits). Handed over out of band, then replaced by the
  // client the first time they sign in.
  const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    // app_metadata, not user_metadata: only the admin API can set it, and the
    // signed-in user cannot rewrite it via auth.updateUser({ data }). This is
    // what handle_new_user reads to create the profile as role='client' with
    // this client_id already set — see supabase/064_client_tenancy.sql.
    app_metadata: { portal_client_id: clientId },
  });

  if (createError || !created.user) {
    return fail(createError?.message ?? "Could not create the portal login.");
  }

  revalidatePath("/team/client-access");
  return { error: null, createdPassword: tempPassword, createdEmail: email };
}

/** Emails a Supabase password-reset link.
 *
 * The safer way to hand over a brand-new login: the client sets their own
 * password from their own mailbox, so nothing sensitive travels through a
 * chat message. Also the fix for an ordinary forgotten password. */
export async function sendPortalPasswordReset(
  userId: string
): Promise<{ error?: string; sent?: boolean }> {
  if (!(await requirePermission("manage_client_access"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.role !== "client") return { error: "Not a portal login." };

  // Sent through the ordinary (anon) client because that's the flow that
  // emails the user a recovery link; the admin API has no "send reset" call.
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${resolveAppUrl()}/portal`,
  });
  if (error) {
    console.error("sendPortalPasswordReset failed", error);
    return { error: error.message };
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
