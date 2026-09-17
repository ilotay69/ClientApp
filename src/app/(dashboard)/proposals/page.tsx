import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { listProposals, type ProposalListFilters } from "@/lib/proposal-data";
import { ProposalListRow } from "@/components/proposal-list-row";
import { NewProposalPanel } from "@/components/new-proposal-panel";
import { SearchBox } from "@/components/search-box";
import { createProposalAction } from "./actions";
import { filterHref } from "@/components/filter-link";

export const dynamic = "force-dynamic";

const BUCKETS = [
  { value: "open", label: "Open" },
  { value: "accepted", label: "Accepted" },
  { value: "closed", label: "Closed" },
] as const;

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; q?: string; client?: string }>;
}) {
  const { bucket: rawBucket, q, client } = await searchParams;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_proposals"))) redirect("/dashboard");
  const canManage = await hasPermission(supabase, "manage_proposals");

  const bucket = (BUCKETS.find((b) => b.value === rawBucket)?.value ??
    "open") as ProposalListFilters["bucket"];

  // Fetched once without the bucket filter and split here, rather than one
  // query for the visible rows plus another for the tab counts — the search
  // and client filters are already applied, so this is the same working set
  // either way.
  const [all, { data: clients }] = await Promise.all([
    listProposals({ search: q, clientId: client }),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const bucketOf = (status: string) => {
    if (status === "draft" || status === "sent") return "open";
    if (status === "accepted") return "accepted";
    return "closed";
  };
  const proposals = all.filter((p) => bucketOf(p.status) === bucket);
  const countFor = (value: string) => all.filter((p) => bucketOf(p.status) === value).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Proposals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build a proposal, send it as a link, and see who&apos;s actually reading it.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/proposals/brochures"
              className="text-xs text-slate-500 underline hover:text-slate-800"
            >
              Manage brochures
            </Link>
            <NewProposalPanel clients={clients ?? []} action={createProposalAction} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          action="/proposals"
          placeholder="Search proposals…"
          defaultValue={q}
          keep={{ bucket, client }}
        />
      </div>

      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-4">
          {BUCKETS.map((b) => (
            <Link
              key={b.value}
              href={filterHref("/proposals", { bucket: b.value, q, client })}
              className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
                bucket === b.value
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {b.label}
              <span className="ml-1.5 text-xs text-slate-400">{countFor(b.value)}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {proposals.map((proposal) => (
          <ProposalListRow key={proposal.id} proposal={proposal} />
        ))}
        {proposals.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {q || client
              ? "No proposals match that filter."
              : "Nothing here yet. Start one with New proposal."}
          </p>
        )}
      </div>
    </div>
  );
}
