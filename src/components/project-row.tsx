"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import { IconChevronDown } from "@/components/icons";
import { ProjectTaskQuickAdd } from "@/components/project-task-quick-add";
import { AutotaskQuotePicker } from "@/components/autotask-quote-picker";
import type { ProjectTask } from "@/app/(dashboard)/projects/actions";
import type { FormState, AutotaskQuoteOption } from "@/app/(dashboard)/clients/actions";
import type { FormState as TaskFormState } from "@/app/(dashboard)/tasks/actions";

export type ProjectRowData = {
  id: string;
  name: string;
  status: string;
  client_id: string;
  hasAutotaskCompany: boolean;
};

export function ProjectRow({
  project,
  clientName,
  members,
  fetchTasksAction,
  createTaskAction,
  listAutotaskQuotesAction,
  logAutotaskQuoteAction,
}: {
  project: ProjectRowData;
  clientName: string | null;
  members: { id: string; full_name: string }[];
  fetchTasksAction: (projectId: string) => Promise<{ tasks: ProjectTask[] } | { error: string }>;
  createTaskAction: (prevState: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  listAutotaskQuotesAction: (
    clientId: string
  ) => Promise<{ quotes: AutotaskQuoteOption[] } | { error: string }>;
  logAutotaskQuoteAction: (clientId: string, quote: AutotaskQuoteOption) => Promise<FormState>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<ProjectTask[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [loadingTasks, startLoadTasks] = useTransition();

  useEffect(() => {
    if (!expanded || tasks !== null) return;
    startLoadTasks(async () => {
      const result = await fetchTasksAction(project.id);
      if ("error" in result) setTasksError(result.error);
      else setTasks(result.tasks);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const refreshTasks = () => {
    startLoadTasks(async () => {
      const result = await fetchTasksAction(project.id);
      if (!("error" in result)) setTasks(result.tasks);
    });
  };

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-2 text-left hover:bg-slate-50"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
          {project.name}
        </span>
        <span className="w-40 shrink-0 truncate text-sm text-slate-600">{clientName ?? "—"}</span>
        <span className="shrink-0">
          <Badge value={project.status} />
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {expanded && (
        <div
          className="space-y-3 border-t border-slate-100 bg-slate-50 px-5 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={`/projects/${project.id}`} className="text-xs text-slate-500 underline">
            View full project →
          </Link>

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tasks
              </p>
            </div>
            {loadingTasks && tasks === null && (
              <p className="px-3 py-2 text-xs text-slate-500">Loading tasks…</p>
            )}
            {tasksError && <p className="px-3 py-2 text-xs text-red-600">{tasksError}</p>}
            {tasks && tasks.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <p className="min-w-0 truncate text-sm text-slate-900">{t.title}</p>
                    <p className="shrink-0 text-xs text-slate-500">
                      {t.assigneeName ?? "Unassigned"}
                      {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {tasks && tasks.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">No open tasks yet.</p>
            )}
            <ProjectTaskQuickAdd
              clientId={project.client_id}
              projectId={project.id}
              members={members}
              action={async (prevState, formData) => {
                const result = await createTaskAction(prevState, formData);
                if (!result.error) refreshTasks();
                return result;
              }}
            />
          </div>

          {project.hasAutotaskCompany && (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Autotask quotes
              </p>
              <AutotaskQuotePicker
                listAutotaskQuotesAction={() => listAutotaskQuotesAction(project.client_id)}
                logAutotaskQuoteAction={(quote) => logAutotaskQuoteAction(project.client_id, quote)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
