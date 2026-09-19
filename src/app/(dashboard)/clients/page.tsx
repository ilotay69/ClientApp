import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { CLIENT_VIEW_COOKIE, resolveClientView } from "@/lib/client-workspace";
import { ClientDirectory } from "@/components/clients/directory";
import { ClientViewSwitch } from "@/components/clients/view-switch";
import LegacyClientsPage from "./legacy-clients-page";
import { previewClient } from "./workspace-actions";

export const dynamic = "force-dynamic";
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const params = await searchParams;
  const db = await createClient();
  if (!(await hasPermission(db, "view_clients"))) redirect("/dashboard");
  const view = resolveClientView(
    params.view,
    (await cookies()).get(CLIENT_VIEW_COOKIE)?.value,
  );
  if (view === "old")
    return (
      <LegacyClientsPage
        searchParams={Promise.resolve(params)}
        viewControl={<ClientViewSwitch view="old" />}
      />
    );
  const [{ data, error }, canManage, user] = await Promise.all([
    db.from("clients").select("id, name").order("name"),
    hasPermission(db, "manage_clients"),
    getCurrentUser(),
  ]);
  return (
    <ClientDirectory
      clients={data ?? []}
      error={Boolean(error)}
      canManage={canManage}
      userId={user?.id ?? "anonymous"}
      previewAction={previewClient}
    />
  );
}
