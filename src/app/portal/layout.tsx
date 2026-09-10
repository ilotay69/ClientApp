import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/permissions";
import { signOut } from "@/app/login/actions";
import { PortalNav } from "@/components/portal-nav";
import { PORTAL_PAGE_KEYS, fetchAllowedPortalPages, type ClientPortalRole } from "@/lib/portal";
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
    .select("role, client_id, client_role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  const isClient = role === "client";
  // Staff are allowed in so they can preview what a client sees. Anyone who
  // is neither goes back to the role router.
  if (!isClient && !isStaffRole(role)) redirect("/");

  // Best-effort only — this just decides which links the nav *shows*, it
  // isn't the actual security boundary (each gated page's own
  // requirePortalSession(preview, page) call is, and redirects regardless
  // of what the nav displayed). Staff previewing always see every link,
  // same reasoning as getPortalContext's own preview branch.
  const allowedPages = isClient
    ? await fetchAllowedPortalPages((profile?.client_role as ClientPortalRole) ?? "client_owner")
    : new Set(PORTAL_PAGE_KEYS);

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
      <PortalNav
        companyName={companyName}
        allowedPages={Array.from(allowedPages)}
        signOutAction={signOut}
      />
      <main className="px-4 py-8 md:pl-64">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
