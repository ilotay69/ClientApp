import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Role router. Staff go to the dashboard, client-portal logins to the portal.
 *
 * This lives here rather than in src/lib/supabase/middleware.ts deliberately:
 * the middleware runs on every single request, and looking a role up in the
 * database from there would put a query in front of all of them. This is an
 * ordinary Server Component, so the profile read costs nothing extra — and
 * both the middleware and the login form now point at "/" instead of naming
 * a destination, so neither has to know which kind of user is signing in.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "client") redirect("/portal");
  redirect("/dashboard");
}
