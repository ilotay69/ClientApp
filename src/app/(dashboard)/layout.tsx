import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { getMyPermissions, fetchOwnerOnlyPermissions, type PermissionKey } from "@/lib/permissions";
import { SidebarNav } from "@/components/sidebar-nav";
import type { Profile } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();

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
  const canViewTeamTasks = me?.permissions.has("view_team_tasks") ?? false;
  const canViewSalesRequests = me?.permissions.has("view_sales_requests") ?? false;
  const canManageRecruitment = me?.permissions.has("manage_recruitment") ?? false;
  const canManageReconciliation = me?.permissions.has("manage_reconciliation") ?? false;
  const canManageBackups = me?.permissions.has("manage_backups") ?? false;
  const canManageQuarterlyReviews = me?.permissions.has("manage_quarterly_reviews") ?? false;

  const OWNER_ONLY_KEYS: PermissionKey[] = [
    "manage_team",
    "manage_integrations",
    "manage_touchpoints",
    "view_domain_health",
    "manage_recruitment",
    "manage_reconciliation",
    "manage_backups",
    "manage_quarterly_reviews",
  ];
  const ownerOnly = await fetchOwnerOnlyPermissions(supabase, OWNER_ONLY_KEYS);
  const teamOwnerOnly = ownerOnly.manage_team;
  const integrationsOwnerOnly = ownerOnly.manage_integrations;
  const touchpointsOwnerOnly = ownerOnly.manage_touchpoints;
  const domainHealthOwnerOnly = ownerOnly.view_domain_health;
  const recruitmentOwnerOnly = ownerOnly.manage_recruitment;
  const reconciliationOwnerOnly = ownerOnly.manage_reconciliation;
  const backupsOwnerOnly = ownerOnly.manage_backups;
  const quarterlyReviewsOwnerOnly = ownerOnly.manage_quarterly_reviews;

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
        canViewTeamTasks={canViewTeamTasks}
        canViewSalesRequests={canViewSalesRequests}
        canManageRecruitment={canManageRecruitment}
        canManageReconciliation={canManageReconciliation}
        canManageBackups={canManageBackups}
        canManageQuarterlyReviews={canManageQuarterlyReviews}
        teamOwnerOnly={teamOwnerOnly}
        integrationsOwnerOnly={integrationsOwnerOnly}
        touchpointsOwnerOnly={touchpointsOwnerOnly}
        domainHealthOwnerOnly={domainHealthOwnerOnly}
        recruitmentOwnerOnly={recruitmentOwnerOnly}
        reconciliationOwnerOnly={reconciliationOwnerOnly}
        backupsOwnerOnly={backupsOwnerOnly}
        quarterlyReviewsOwnerOnly={quarterlyReviewsOwnerOnly}
        signOutAction={signOut}
      />
      <main className="px-4 py-8 md:pl-64">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
