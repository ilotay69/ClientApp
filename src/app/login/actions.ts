"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null };

/** Only ever redirect to a path inside this app.
 *
 * `next` arrives from a query string, and `redirect()` will happily follow an
 * absolute URL — so `/login?next=https://evil.example` would send someone who
 * has *just* typed their password straight to an attacker's page, having
 * watched them authenticate against the real thing first. That matters more
 * now that client-portal users (non-technical, externally reachable) are being
 * trained to sign in here.
 *
 * "//host" and "/\host" are both protocol-relative and would leave this
 * origin, so a leading-slash test alone isn't enough. */
function safeNext(raw: string): string {
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // "/" is the role router (src/app/page.tsx) — it sends staff to the
  // dashboard and a client-portal login to the portal, so neither needs to be
  // named here.
  const next = safeNext(String(formData.get("next") ?? "/"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

// There is deliberately no signUp action.
//
// Accounts are created by an Owner from Team -> Add member (staff) or
// Team -> Client access (portal logins), never self-serve. The public
// /sign-up page that used to live here let anyone who found the URL mint
// themselves a 'tech' profile, which — given how RLS was written — meant read
// access to every client's data.
//
// Removing this action does NOT close self-registration on its own:
// `POST /auth/v1/signup` is a project-level Supabase endpoint reachable with
// the anon key from the browser bundle. Two things back this up:
//   - Authentication -> Providers -> Email -> "Enable signup" is off in the
//     Supabase dashboard.
//   - public.handle_new_user() (supabase/063_profile_privilege_hardening.sql)
//     raises unless the account was provisioned via the admin API or has a
//     @cgtechnologies.com address.

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
