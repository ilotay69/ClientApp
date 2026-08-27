import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project-form";
import { DeleteButton } from "@/components/delete-button";
import { updateProject, deleteProject } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: clients }] = await Promise.all([
    supabase.from("projects").select("*, clients(name)").eq("id", id).single(),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  if (!project) notFound();

  const clientName = (project.clients as unknown as { name: string } | null)?.name;
  const updateAction = updateProject.bind(null, id, project.client_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/projects" className="text-sm text-slate-500 hover:underline">
            ← All projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{project.name}</h1>
          {clientName && (
            <p className="text-sm text-slate-500">
              <Link href={`/clients/${project.client_id}`} className="hover:underline">
                {clientName}
              </Link>
            </p>
          )}
        </div>
        <DeleteButton
          action={deleteProject.bind(null, id, project.client_id)}
          confirmText={`Delete the project "${project.name}"?`}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ProjectForm
          project={project}
          clients={clients ?? []}
          action={updateAction}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
