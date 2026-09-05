import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { FilterLink, filterHref } from "@/components/filter-link";
import { SearchBox } from "@/components/search-box";
import { SyncAutotaskButton } from "@/components/sync-autotask-button";
import { ProjectRow, type ProjectRowData } from "@/components/project-row";
import { syncAllAutotaskProjectsAction, autoSyncAutotaskProjectsIfStale, getProjectTasksAction } from "./actions";
import { createTask } from "../tasks/actions";
import { listAutotaskQuotesForClientAction, logAutotaskQuoteReference } from "../clients/actions";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "planning", label: "Planning" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const supabase = await createClient();

  let projectsQuery = supabase
    .from("projects")
    .select("id, name, status, client_id, clients(name, autotask_company_id)")
    .order("target_end_date", { ascending: true, nullsFirst: false });

  if (status) projectsQuery = projectsQuery.eq("status", status);
  if (q) projectsQuery = projectsQuery.ilike("name", `%${q}%`);

  const [{ data: projects }, { data: members }, canManageProjects] = await Promise.all([
    projectsQuery,
    supabase.from("profiles").select("id, full_name").order("full_name"),
    hasPermission(supabase, "manage_projects"),
  ]);

  // Fire-and-forget: never awaited, so a visit here never waits on
  // Autotask — see autoSyncAutotaskProjectsIfStale's own comment for why.
  if (canManageProjects) {
    autoSyncAutotaskProjectsIfStale().catch((err) => {
      console.error("Background Autotask projects sync failed", err);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
        {canManageProjects && (
          <div className="flex items-center gap-3">
            <SyncAutotaskButton action={syncAllAutotaskProjectsAction} />
            <Link
              href="/projects/new"
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              New project
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <FilterLink href={filterHref("/projects", { q })} active={!status}>
            All
          </FilterLink>
          {STATUS_FILTERS.map((f) => (
            <FilterLink
              key={f.value}
              href={filterHref("/projects", { status: f.value, q })}
              active={status === f.value}
            >
              {f.label}
            </FilterLink>
          ))}
        </div>
        <SearchBox
          action="/projects"
          placeholder="Search projects…"
          defaultValue={q}
          keep={{ status }}
        />
      </div>

      <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        {(projects ?? []).map((p) => {
          const client = p.clients as unknown as { name: string; autotask_company_id: number | null } | null;
          const row: ProjectRowData = {
            id: p.id,
            name: p.name,
            status: p.status,
            client_id: p.client_id,
            hasAutotaskCompany: Boolean(client?.autotask_company_id),
          };
          return (
            <ProjectRow
              key={p.id}
              project={row}
              clientName={client?.name ?? null}
              members={members ?? []}
              fetchTasksAction={getProjectTasksAction}
              createTaskAction={createTask}
              listAutotaskQuotesAction={listAutotaskQuotesForClientAction}
              logAutotaskQuoteAction={logAutotaskQuoteReference}
            />
          );
        })}
        {(projects ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-slate-500">
            {status || q ? (
              <>
                No projects match this filter.{" "}
                <Link href="/projects" className="underline">
                  Clear filters
                </Link>
              </>
            ) : (
              <>
                No projects yet.{" "}
                <Link href="/projects/new" className="underline">
                  Add your first one.
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
