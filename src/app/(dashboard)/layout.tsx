import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { getMyPermissions } from "@/lib/permissions";
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

  const me = await getMyPermissions(supabase);
  const canManageServiceCatalog = me?.permissions.has("manage_service_catalog") ?? false;
  const canManageServices = me?.permissions.has("manage_services") ?? false;
  const canManageIntegrations = me?.permissions.has("manage_integrations") ?? false;
  const canManageTeam = me?.permissions.has("manage_team") ?? false;

  return (
    <div className="min-h-screen bg-slate-50">
      <SidebarNav
        userLabel={profile?.full_name ?? user?.email ?? ""}
        canManageServiceCatalog={canManageServiceCatalog}
        canManageServices={canManageServices}
        canManageIntegrations={canManageIntegrations}
        canManageTeam={canManageTeam}
        signOutAction={signOut}
      />
      <main className="px-4 py-8 md:pl-64">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
