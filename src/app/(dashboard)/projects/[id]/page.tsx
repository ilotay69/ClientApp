import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { ProjectForm } from "@/components/project-form";
import { DeleteButton } from "@/components/delete-button";
import { Badge } from "@/components/badge";
import { ProjectAutotaskTicketDetail } from "@/components/project-autotask-ticket-detail";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { formatDate } from "@/lib/format";
import { updateProject, deleteProject, getProjectTicketDetailAction } from "../actions";
import { deleteTask, updateTaskField, setTaskAssignees, getTaskNotesAction, addTaskNote } from "../../tasks/actions";

export const dynamic = "force-dynamic";

const TASK_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "waiting_client", label: "Waiting Client" },
  { value: "done", label: "Done" },
];

// A task created before this status list changed may still carry some
// other legacy value — fall it into the picker so the select shows the
// real current value instead of silently mismatching. Same helper as
// tasks/page.tsx (not exported from there since it's a "use server" file).
function statusOptionsFor(current: string) {
  if (TASK_STATUS_OPTIONS.some((o) => o.value === current)) return TASK_STATUS_OPTIONS;
  return [...TASK_STATUS_OPTIONS, { value: current, label: current }];
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  if (!(await hasPermission(supabase, "view_projects"))) {
    redirect("/dashboard");
  }

  const [{ data: project }, { data: clients }, { data: tasks }, { data: members }, canDeleteTasks] =
    await Promise.all([
      supabase.from("projects").select("*, clients(name)").eq("id", id).single(),
      supabase.from("clients").select("id, name").order("name"),
      supabase
        .from("tasks")
        .select(
          "id, kind, title, detail, notes, status, priority, start_date, due_date, client_id, project_id, is_personal, task_assignees(profile_id)"
        )
        .eq("project_id", id)
        .not("status", "in", "(done,dismissed)")
        .order("due_date", { ascending: true, nullsFirst: false }),
      // neq("role", "client"): client-portal logins aren't staff and must
      // never appear as an assignable person here — same rule as /tasks.
      supabase.from("profiles").select("id, full_name").neq("role", "client").order("full_name"),
      hasPermission(supabase, "delete_tasks"),
    ]);

  if (!project) notFound();

  const clientName = (project.clients as unknown as { name: string } | null)?.name;
  const updateAction = updateProject.bind(null, id, project.client_id);
  const fromAutotask = project.source_autotask_ticket_id !== null;
  const memberById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

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
          {(tasks ?? []).map((t) => {
            const assigneeIds = (
              (t.task_assignees as unknown as { profile_id: string }[] | null) ?? []
            ).map((a) => a.profile_id);
            const assigneeNames = assigneeIds
              .map((assigneeId) => memberById.get(assigneeId))
              .filter((n): n is string => Boolean(n))
              .join(", ");

            return (
              <TaskRow
                key={t.id}
                task={t as TaskRowData}
                clientName={clientName ?? null}
                assigneeNames={assigneeNames}
                assigneeIds={assigneeIds}
                members={members ?? []}
                canDelete={canDeleteTasks}
                statusOptions={statusOptionsFor(t.status)}
                updateFieldAction={updateTaskField}
                updateAssigneesAction={setTaskAssignees}
                deleteAction={deleteTask.bind(null, t.id)}
                fetchNotesAction={getTaskNotesAction}
                addNoteAction={addTaskNote.bind(null, t.id)}
              />
            );
          })}
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

      {fromAutotask && (
        <ProjectAutotaskTicketDetail
          ticketId={project.source_autotask_ticket_id}
          detailAction={getProjectTicketDetailAction}
        />
      )}
    </div>
  );
}
