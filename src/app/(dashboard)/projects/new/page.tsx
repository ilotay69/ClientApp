import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ProjectForm } from "@/components/project-form";
import { createProject } from "../actions";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id } = await searchParams;
  const supabase = await createClient();
  if (!(await hasPermission(supabase, "manage_projects"))) {
    redirect("/projects");
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">New project</h1>
      <ProjectForm
        clients={clients ?? []}
        defaultClientId={client_id}
        action={createProject}
        submitLabel="Create project"
      />
    </div>
  );
}
