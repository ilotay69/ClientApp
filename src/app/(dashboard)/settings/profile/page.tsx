import { redirect } from "next/navigation";
import { createClient, createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchActiveResources } from "@/lib/autotask";
import { MyAutotaskResourceForm } from "@/components/my-autotask-resource-form";
import { saveMyAutotaskResourceAction } from "./actions";

export const dynamic = "force-dynamic";

// Personal, ungated by any permission beyond being signed in — same
// posture as /settings/mail and /settings/dashboard: it's each user's own
// mapping, not a shared setting anyone needs manage_integrations to touch.
export default async function MyProfileSettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, autotask_resource_id")
    .eq("id", user.id)
    .single();

  const settings = await getAutotaskSettings(createAdminClient());
  const resources = settings?.zoneUrl
    ? await fetchActiveResources(settings.credentials, settings.zoneUrl)
    : [];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          {profile?.full_name} · {profile?.email}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Your Autotask resource</h2>
        <p className="mt-1 text-sm text-slate-500">
          My Tickets and Team Hours match your Autotask work by name unless you set this
          explicitly. Pick your own resource here once, and a later name change on either side
          (a nickname, a rename) won&apos;t break the match again.
        </p>
        {!settings?.zoneUrl ? (
          <p className="mt-3 text-sm text-red-600">
            Autotask isn&apos;t connected yet — set it up under Settings → Integrations first.
          </p>
        ) : (
          <div className="mt-3">
            <MyAutotaskResourceForm
              resources={resources}
              currentResourceId={profile?.autotask_resource_id ?? null}
              saveAction={saveMyAutotaskResourceAction}
            />
          </div>
        )}
      </div>
    </div>
  );
}
