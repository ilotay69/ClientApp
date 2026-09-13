import { redirect } from "next/navigation";
import { requirePortalSession } from "@/lib/portal";
import { fetchReviewsForClient } from "@/lib/quarterly-review-data";
import { PortalPageHeader, PortalCard, EmptyRow } from "@/components/portal-ui";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  const session = await requirePortalSession(preview, "reviews");
  if (!session) redirect("/portal");

  // Only ever the reviews CG Technologies has actually sent — draft,
  // submitted, and approved-but-not-yet-sent reviews are internal and
  // never reach this list, same boundary the download route itself
  // re-checks (a client never sees a review before it's been sent).
  const reviews = (await fetchReviewsForClient(session.client.clientId)).filter((r) => r.status === "sent");

  return (
    <div className="space-y-6">
      <PortalPageHeader
        companyName={session.client.clientName}
        title="Quarterly Reviews"
        subtitle="Quarterly systems reviews CG Technologies has sent you."
        isPreview={session.isPreview}
      />

      <PortalCard title="Sent reviews">
        {reviews.length === 0 ? (
          <EmptyRow>No reviews have been sent yet.</EmptyRow>
        ) : (
          <div className="divide-y divide-slate-100">
            {reviews.map((r) => (
              <a
                key={r.id}
                href={`/api/quarterly-review-pdf/${r.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{r.reviewPeriod}</span>
                <span className="text-xs text-slate-500">{r.sentAt ? `Sent ${formatDate(r.sentAt)}` : ""}</span>
              </a>
            ))}
          </div>
        )}
      </PortalCard>
    </div>
  );
}
