import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project-form";
import { DeleteButton } from "@/components/delete-button";
import { Badge, OverdueBadge } from "@/components/badge";
import { formatDate, isOverdue } from "@/lib/format";
import { updateProject, deleteProject } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: clients }, { data: tasks }] = await Promise.all([
    supabase.from("projects").select("*, clients(name)").eq("id", id).single(),
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("tasks")
      .select("id, kind, title, status, due_date, profiles:assigned_to(full_name)")
      .eq("project_id", id)
      .not("status", "in", "(done,dismissed)")
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  if (!project) notFound();

  const clientName = (project.clients as unknown as { name: string } | null)?.name;
  const updateAction = updateProject.bind(null, id, project.client_id);
  const fromAutotask = project.source_autotask_ticket_id !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/projects" className="text-sm text-slate-500 hover:underline">
            ← All projects
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
            {fromAutotask && <Badge value="autotask" />}
          </div>
          {clientName && (
            <p className="text-sm text-slate-500">
              <Link href={`/clients/${project.client_id}`} className="hover:underline">
                {clientName}
              </Link>
            </p>
          )}
        </div>
        {!fromAutotask && (
          <DeleteButton
            action={deleteProject.bind(null, id, project.client_id)}
            confirmText={`Delete the project "${project.name}"?`}
          />
        )}
      </div>

      {fromAutotask ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            This project is synced from an Autotask ticket tagged with the Project SLA — its
            name, status, and dates come from that ticket and refresh on the next Autotask sync.
            Edit the ticket in Autotask, not here; changes made on this page would just be
            overwritten. It can&apos;t be deleted from here either, for the same reason — remove
            the Project SLA tag (or the ticket) in Autotask instead.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</dt>
              <dd className="mt-1">
                <Badge value={project.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Start</dt>
              <dd className="mt-1 text-slate-700">{formatDate(project.start_date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Target end
              </dt>
              <dd className="mt-1 text-slate-700">{formatDate(project.target_end_date)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ProjectForm
            project={project}
            clients={clients ?? []}
            action={updateAction}
            submitLabel="Save changes"
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
          <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
          <Link
            href={`/tasks?project_id=${id}&client_id=${project.client_id}`}
            className="text-sm text-slate-600 hover:underline"
          >
            + Add
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {(tasks ?? []).map((t) => (
            <Link
              key={t.id}
              href="/tasks"
              className="flex items-center justify-between px-5 py-2 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{t.title}</p>
                <p className="text-xs text-slate-500">
                  {(t.profiles as unknown as { full_name: string } | null)?.full_name ?? "Unassigned"}
                  {t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isOverdue(t.due_date) && <OverdueBadge />}
                <Badge value={t.kind} />
              </div>
            </Link>
          ))}
          {(tasks ?? []).length === 0 && (
            <p className="px-5 py-4 text-sm text-slate-500">
              No open tasks tied to this project yet. Add one from the{" "}
              <Link href={`/tasks?project_id=${id}&client_id=${project.client_id}`} className="underline">
                Tasks tab
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
