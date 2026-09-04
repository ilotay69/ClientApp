import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { SalesRequestQuickAdd } from "@/components/sales-request-quick-add";
import { SalesRequestFilterBar } from "@/components/sales-request-filter-bar";
import { SalesRequestRow, type SalesRequestRowData } from "@/components/sales-request-row";
import { filterHref } from "@/components/filter-link";
import {
  createSalesRequest,
  deleteSalesRequest,
  updateSalesRequestField,
  getSalesRequestNotesAction,
  addSalesRequestNote,
} from "./actions";

export const dynamic = "force-dynamic";

const STAGE_OPTIONS = [
  { value: "requested", label: "Requested" },
  { value: "quoted", label: "Quoted" },
  { value: "approved", label: "Approved" },
  { value: "ordered", label: "Ordered" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function SalesRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; stage?: string; assignee?: string; source?: string }>;
}) {
  const {
    client: filterClient,
    stage: filterStage,
    assignee: filterAssignee,
    source: filterSource,
  } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: clients }, { data: members }, canManage, { data: me }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    hasPermission(supabase, "manage_sales_requests"),
    user
      ? supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const memberById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const clientOptions = [{ value: "", label: "No client (internal)" }].concat(
    (clients ?? []).map((c) => ({ value: c.id, label: c.name }))
  );

  let query = supabase
    .from("sales_requests")
    .select(
      "id, title, detail, stage, source, client_id, assigned_to, requested_by_name, requested_by_email, created_at"
    )
    .order("stage", { ascending: true })
    .order("created_at", { ascending: false });

  if (filterClient === "none") {
    query = query.is("client_id", null);
  } else if (filterClient) {
    query = query.eq("client_id", filterClient);
  }
  if (filterStage) query = query.eq("stage", filterStage);
  if (filterAssignee) query = query.eq("assigned_to", filterAssignee);
  if (filterSource) query = query.eq("source", filterSource);

  const { data: requests } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Internal Sales</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every quote/order ask, tracked from Requested through Delivered — for a client, or
          internal.
        </p>
      </div>

      <SalesRequestFilterBar
        clients={clients ?? []}
        members={members ?? []}
        stageOptions={STAGE_OPTIONS}
        values={{
          client: filterClient ?? "",
          stage: filterStage ?? "",
          assignee: filterAssignee ?? "",
          source: filterSource ?? "",
        }}
        clearHref={filterHref("/sales-requests", {})}
      />

      {canManage && (
        <SalesRequestQuickAdd
          clients={clients ?? []}
          members={members ?? []}
          action={createSalesRequest}
          defaultClientId={filterClient && filterClient !== "none" ? filterClient : ""}
          defaultAssignedTo={user?.id ?? ""}
          defaultRequestedByName={me?.full_name ?? ""}
          defaultRequestedByEmail={me?.email ?? ""}
        />
      )}

      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        {(requests ?? []).map((r) => (
          <SalesRequestRow
            key={r.id}
            request={r as SalesRequestRowData}
            clientName={r.client_id ? (clientById.get(r.client_id) ?? null) : null}
            assigneeName={r.assigned_to ? (memberById.get(r.assigned_to) ?? null) : null}
            clientOptions={clientOptions}
            members={members ?? []}
            canManage={canManage}
            stageOptions={STAGE_OPTIONS}
            updateFieldAction={updateSalesRequestField}
            deleteAction={deleteSalesRequest.bind(null, r.id)}
            fetchNotesAction={getSalesRequestNotesAction}
            addNoteAction={addSalesRequestNote.bind(null, r.id)}
          />
        ))}
        {(requests ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-slate-500">
            Nothing here yet{canManage ? " — add one above." : "."}
          </p>
        )}
      </div>
    </div>
  );
}
