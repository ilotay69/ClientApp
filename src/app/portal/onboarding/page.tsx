import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { PortalPageHeader } from "@/components/portal-ui";
import { IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Deliberately empty. It exists now so the nav entry, the permission row
 * and the route are all in place — adding the actual request form later is
 * then a change to this one file rather than another pass over the portal's
 * plumbing. */
export default async function PortalOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = typeof params.preview === "string" ? params.preview : undefined;
  const session = await requirePortalSession(preview, "onboarding");
  if (!session) redirect("/portal");

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Onboarding / Offboarding"
        subtitle="Request a new starter to be set up, or a leaver to be offboarded."
        isPreview={session.isPreview}
      />

      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <IconUsers className="mx-auto h-8 w-8 text-slate-300" />
        <h2 className="mt-3 text-sm font-semibold text-slate-900">Coming soon</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          You&apos;ll be able to raise starter and leaver requests here. For now, please contact
          your account manager or raise a ticket as usual.
        </p>
      </div>
    </div>
  );
}
