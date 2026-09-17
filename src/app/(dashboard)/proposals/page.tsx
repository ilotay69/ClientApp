import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { listProposals, type ProposalListItem } from "@/lib/proposal-data";
import { ProposalListRow } from "@/components/proposal-list-row";
import { NewProposalPanel } from "@/components/new-proposal-panel";
import { SearchBox } from "@/components/search-box";
import { createProposalAction } from "./actions";
import { FilterLink, filterHref } from "@/components/filter-link";

export const dynamic = "force-dynamic";

const BUCKETS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "processing_internally", label: "Processing Internally" },
  { value: "closed", label: "Closed" },
] as const;

type Bucket = (typeof BUCKETS)[number]["value"];

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; q?: string; client?: string; mine?: string }>;
}) {
  const { bucket: rawBucket, q, client, mine } = await searchParams;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_proposals"))) redirect("/dashboard");
  const canManage = await hasPermission(supabase, "manage_proposals");
  const user = await getCurrentUser();

  const bucket = (BUCKETS.find((b) => b.value === rawBucket)?.value ?? "draft") as Bucket;
  const mineOnly = mine === "1";

  // Fetched once without the bucket filter and split here, rather than one
  // query for the visible rows plus another for the tab counts — the search
  // and client filters are already applied, so this is the same working set
  // either way.
  const [rawAll, { data: clients }] = await Promise.all([
    listProposals({ search: q, clientId: client }),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  const all = mineOnly ? rawAll.filter((p) => p.ownerId === user?.id) : rawAll;

  // Processing Internally is a sub-split of "accepted", not a real status
  // (see migration 138) — an accepted proposal is either still just
  // "accepted" or has been flagged as being worked on internally, never
  // both tabs at once.
  const bucketOf = (p: Pick<ProposalListItem, "status" | "processingInternally">): Bucket => {
    if (p.status === "draft") return "draft";
    if (p.status === "sent") return "sent";
    if (p.status === "accepted") return p.processingInternally ? "processing_internally" : "accepted";
    return "closed";
  };
  const proposals = all.filter((p) => bucketOf(p) === bucket);
  const countFor = (value: Bucket) => all.filter((p) => bucketOf(p) === value).length;

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          action="/proposals"
          placeholder="Search proposals…"
          defaultValue={q}
          keep={{ bucket, client, mine }}
        />
        <div className="flex gap-2 text-sm">
          <FilterLink href={filterHref("/proposals", { bucket, q, client })} active={!mineOnly}>
            All
          </FilterLink>
          <FilterLink href={filterHref("/proposals", { bucket, q, client, mine: "1" })} active={mineOnly}>
            Mine
          </FilterLink>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-4">
          {BUCKETS.map((b) => (
            <Link
              key={b.value}
              href={filterHref("/proposals", { bucket: b.value, q, client, mine })}
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
            {q || client || mineOnly
              ? "No proposals match that filter."
              : "Nothing here yet. Start one with New proposal."}
          </p>
        )}
      </div>
    </div>
  );
}
