import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/permissions";
import { signOut } from "@/app/login/actions";
import { PortalNav } from "@/components/portal-nav";
import type { UserRole } from "@/lib/types";

// Every portal route is per-viewer data and must never be prerendered. The
// pages set this too, and getPortalContext() touches cookies() first so the
// dynamic signal is structural as well — belt, braces, and a second pair of
// braces, because a statically built portal page would mean one client's
// figures baked into HTML served to all of them.
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  const isClient = role === "client";
  // Staff are allowed in so they can preview what a client sees. Anyone who
  // is neither goes back to the role router.
  if (!isClient && !isStaffRole(role)) redirect("/");

  // The company name in the sidebar. A layout can't read searchParams, so a
  // staff previewer's chosen client isn't knowable here — each page renders
  // the real company name in its own heading, and this just labels the chrome.
  let companyName = "Client portal";
  if (isClient && profile?.client_id) {
    const admin = createAdminClient();
    const { data: client } = await admin
      .from("clients")
      .select("name")
      .eq("id", profile.client_id)
      .maybeSingle();
    companyName = client?.name ?? "Client portal";
  } else if (!isClient) {
    companyName = "Staff preview";
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalNav companyName={companyName} signOutAction={signOut} />
      <main className="px-4 py-8 md:pl-64">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
