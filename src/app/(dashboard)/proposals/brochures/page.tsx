import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { fetchProposalBrochures } from "@/lib/proposal-brochures";
import { ProposalBrochureUploadForm } from "@/components/proposal-brochure-upload-form";
import { DeleteButton } from "@/components/delete-button";
import { formatDate } from "@/lib/format";
import { uploadProposalBrochureAction, deleteProposalBrochureAction } from "./actions";

export const dynamic = "force-dynamic";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The shared brochure library — upload once here, then check which of
 * these go out with any given proposal from that proposal's own page. */
export default async function ProposalBrochuresPage() {
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_proposals"))) redirect("/proposals");

  const brochures = await fetchProposalBrochures();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/proposals" className="text-xs text-slate-500 hover:text-slate-800">
          ← All proposals
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Brochures</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a company brochure or product sheet once, then check it on any proposal that
          should include it — it goes out as an email attachment and shows as a link on the
          prospect&apos;s own page.
        </p>
      </div>

      <ProposalBrochureUploadForm action={uploadProposalBrochureAction} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {brochures.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-3 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{b.title}</span>
              <span className="block truncate text-xs text-slate-500">
                {b.fileName} · {formatSize(b.sizeBytes)} · added {formatDate(b.createdAt)}
              </span>
            </span>
            <DeleteButton
              action={deleteProposalBrochureAction.bind(null, b.id)}
              confirmText={`Delete "${b.title}"? It will be removed from every proposal that has it checked.`}
              label="Delete"
            />
          </div>
        ))}
        {brochures.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No brochures yet. Upload one above.
          </p>
        )}
      </div>
    </div>
  );
}
