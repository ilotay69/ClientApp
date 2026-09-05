"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import { IconChevronDown } from "@/components/icons";
import { ProjectTaskQuickAdd } from "@/components/project-task-quick-add";
import { AutotaskQuotePicker } from "@/components/autotask-quote-picker";
import type { ProjectTask, ProjectQuoteLogEntry } from "@/app/(dashboard)/projects/actions";
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
  fetchQuoteLogAction,
}: {
  project: ProjectRowData;
  clientName: string | null;
  members: { id: string; full_name: string }[];
  fetchTasksAction: (projectId: string) => Promise<{ tasks: ProjectTask[] } | { error: string }>;
  createTaskAction: (prevState: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  listAutotaskQuotesAction: (
    clientId: string
  ) => Promise<{ quotes: AutotaskQuoteOption[] } | { error: string }>;
  logAutotaskQuoteAction: (
    clientId: string,
    projectId: string,
    quote: AutotaskQuoteOption
  ) => Promise<FormState>;
  fetchQuoteLogAction: (
    projectId: string
  ) => Promise<{ entries: ProjectQuoteLogEntry[] } | { error: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<ProjectTask[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [loadingTasks, startLoadTasks] = useTransition();
  const [quoteLog, setQuoteLog] = useState<ProjectQuoteLogEntry[] | null>(null);
  const [quoteLogError, setQuoteLogError] = useState<string | null>(null);
  const [loadingQuoteLog, startLoadQuoteLog] = useTransition();

  useEffect(() => {
    if (!expanded || tasks !== null) return;
    startLoadTasks(async () => {
      const result = await fetchTasksAction(project.id);
      if ("error" in result) setTasksError(result.error);
      else setTasks(result.tasks);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !project.hasAutotaskCompany || quoteLog !== null) return;
    startLoadQuoteLog(async () => {
      const result = await fetchQuoteLogAction(project.id);
      if ("error" in result) setQuoteLogError(result.error);
      else setQuoteLog(result.entries);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const refreshTasks = () => {
    startLoadTasks(async () => {
      const result = await fetchTasksAction(project.id);
      if (!("error" in result)) setTasks(result.tasks);
    });
  };

  const refreshQuoteLog = () => {
    startLoadQuoteLog(async () => {
      const result = await fetchQuoteLogAction(project.id);
      if (!("error" in result)) setQuoteLog(result.entries);
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

              {loadingQuoteLog && quoteLog === null && (
                <p className="text-xs text-slate-500">Loading logged quotes…</p>
              )}
              {quoteLogError && <p className="text-xs text-red-600">{quoteLogError}</p>}
              {quoteLog && quoteLog.length > 0 && (
                <ul className="mb-3 space-y-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                  {quoteLog.map((entry) => (
                    <li key={entry.id} className="px-3 py-2">
                      <p className="text-sm font-medium text-slate-900">{entry.subject}</p>
                      {entry.body && <p className="text-xs text-slate-500">{entry.body}</p>}
                      {entry.externalLink && (
                        <a
                          href={entry.externalLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-block text-xs text-slate-500 underline"
                        >
                          View in Autotask
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <AutotaskQuotePicker
                listAutotaskQuotesAction={() => listAutotaskQuotesAction(project.client_id)}
                logAutotaskQuoteAction={(quote) =>
                  logAutotaskQuoteAction(project.client_id, project.id, quote)
                }
                onLogged={refreshQuoteLog}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
