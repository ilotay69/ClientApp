import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { getMyPermissions, isPermissionOwnerOnly } from "@/lib/permissions";
import { SidebarNav } from "@/components/sidebar-nav";
import type { Profile } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  // A client-portal login has no business anywhere in the staff tree. This is
  // defence in depth, not the boundary: a layout renders in parallel with the
  // page beneath it, so the page's own queries may still run before this
  // redirect wins the response. The boundary is 065's RLS (a client's reads
  // return nothing) plus requireStaff() on the server actions.
  if (profile?.role === "client") redirect("/portal");

  const me = await getMyPermissions(supabase);
  const canManageIntegrations = me?.permissions.has("manage_integrations") ?? false;
  const canManageTeam = me?.permissions.has("manage_team") ?? false;
  const canViewReports = me?.permissions.has("view_team_wide") ?? false;
  const canManageTouchpoints = me?.permissions.has("manage_touchpoints") ?? false;
  const canViewDomainHealth = me?.permissions.has("view_domain_health") ?? false;
  const canViewLookups = me?.permissions.has("view_lookups") ?? false;
  const canViewAnalysis = me?.permissions.has("view_analysis") ?? false;
  const canViewDashboard = me?.permissions.has("view_dashboard") ?? false;
  const canViewClients = me?.permissions.has("view_clients") ?? false;
  const canViewProjects = me?.permissions.has("view_projects") ?? false;
  const canViewSalesRequests = me?.permissions.has("view_sales_requests") ?? false;

  const [teamOwnerOnly, integrationsOwnerOnly, touchpointsOwnerOnly, domainHealthOwnerOnly] =
    await Promise.all([
      isPermissionOwnerOnly(supabase, "manage_team"),
      isPermissionOwnerOnly(supabase, "manage_integrations"),
      isPermissionOwnerOnly(supabase, "manage_touchpoints"),
      isPermissionOwnerOnly(supabase, "view_domain_health"),
    ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <SidebarNav
        userLabel={profile?.full_name ?? user?.email ?? ""}
        canManageIntegrations={canManageIntegrations}
        canManageTeam={canManageTeam}
        canViewReports={canViewReports}
        canManageTouchpoints={canManageTouchpoints}
        canViewDomainHealth={canViewDomainHealth}
        canViewLookups={canViewLookups}
        canViewAnalysis={canViewAnalysis}
        canViewDashboard={canViewDashboard}
        canViewClients={canViewClients}
        canViewProjects={canViewProjects}
        canViewSalesRequests={canViewSalesRequests}
        teamOwnerOnly={teamOwnerOnly}
        integrationsOwnerOnly={integrationsOwnerOnly}
        touchpointsOwnerOnly={touchpointsOwnerOnly}
        domainHealthOwnerOnly={domainHealthOwnerOnly}
        signOutAction={signOut}
      />
      <main className="px-4 py-8 md:pl-64">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
