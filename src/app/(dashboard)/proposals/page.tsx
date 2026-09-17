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

// Automatic, not a field anyone sets - a proposal is for an existing
// client the same way it always has been: client_id is set (picked from
// the Autotask-linked client dropdown) versus null (a prospect_company
// typed in by hand). See createProposalAction's own recipient.clientId
// check.
const isExistingClient = (p: Pick<ProposalListItem, "clientId">) => Boolean(p.clientId);

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ pBucket?: string; cBucket?: string; q?: string; mine?: string }>;
}) {
  const { pBucket: rawPBucket, cBucket: rawCBucket, q, mine } = await searchParams;

  const supabase = await createClient();
  if (!(await hasPermission(supabase, "view_proposals"))) redirect("/dashboard");
  const canManage = await hasPermission(supabase, "manage_proposals");
  const user = await getCurrentUser();

  const pBucket = (BUCKETS.find((b) => b.value === rawPBucket)?.value ?? "draft") as Bucket;
  const cBucket = (BUCKETS.find((b) => b.value === rawCBucket)?.value ?? "draft") as Bucket;
  const mineOnly = mine === "1";

  const [rawAll, { data: clients }] = await Promise.all([
    listProposals({ search: q }),
    supabase
      .from("clients")
      .select("id, name, contactName:primary_contact_name, contactEmail:primary_contact_email, address")
      .order("name"),
  ]);
  const all = mineOnly ? rawAll.filter((p) => p.ownerId === user?.id) : rawAll;

  const prospects = all.filter((p) => !isExistingClient(p));
  const existingClients = all.filter((p) => isExistingClient(p));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Proposals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build a proposal, send it as a link, and see who&apos;s actually reading it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2 text-sm">
            <FilterLink href={filterHref("/proposals", { pBucket, cBucket, q })} active={!mineOnly}>
              All
            </FilterLink>
            <FilterLink href={filterHref("/proposals", { pBucket, cBucket, q, mine: "1" })} active={mineOnly}>
              Mine
            </FilterLink>
          </div>
          {canManage && (
            <>
              <Link
                href="/proposals/brochures"
                className="text-xs text-slate-500 underline hover:text-slate-800"
              >
                Manage brochures
              </Link>
              <NewProposalPanel clients={clients ?? []} action={createProposalAction} />
            </>
          )}
        </div>
      </div>

      <SearchBox
        action="/proposals"
        placeholder="Search proposals…"
        defaultValue={q}
        keep={{ pBucket, cBucket, mine }}
      />

      <RecipientSection
        title="Prospects"
        paramName="pBucket"
        bucket={pBucket}
        otherParams={{ cBucket, q, mine }}
        items={prospects}
      />

      <RecipientSection
        title="Existing Clients"
        paramName="cBucket"
        bucket={cBucket}
        otherParams={{ pBucket, q, mine }}
        items={existingClients}
      />
    </div>
  );
}

/** One recipient type's own full status-tab view - its own tab strip,
 * its own bucket counts, scoped to just its own items (prospects and
 * existing clients never share a bucket count or a tab selection with
 * each other). otherParams carries the OTHER section's current bucket
 * (plus q/mine) through every link here, so switching this section's tab
 * never resets the other section's. */
function RecipientSection({
  title,
  paramName,
  bucket,
  otherParams,
  items,
}: {
  title: string;
  paramName: "pBucket" | "cBucket";
  bucket: Bucket;
  otherParams: Record<string, string | undefined>;
  items: ProposalListItem[];
}) {
  const visible = items.filter((p) => bucketOf(p) === bucket);
  const countFor = (value: Bucket) => items.filter((p) => bucketOf(p) === value).length;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title} <span className="normal-case text-slate-400">({items.length})</span>
      </h2>

      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-4">
          {BUCKETS.map((b) => (
            <Link
              key={b.value}
              href={filterHref("/proposals", { ...otherParams, [paramName]: b.value })}
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

      <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm">
        {visible.map((proposal) => (
          <ProposalListRow key={proposal.id} proposal={proposal} />
        ))}
        {visible.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {items.length === 0 ? `Nothing here yet.` : "Nothing in this status."}
          </p>
        )}
      </div>
    </div>
  );
}
