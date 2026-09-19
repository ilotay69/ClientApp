import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/permissions";
import {
  normalizePreferences,
  type TodoActions,
} from "@/lib/my-todo-workspace";
import { TodoWorkspace } from "@/components/my-todo/workspace";
import { TodoViewSwitch } from "@/components/my-todo/view-switch";
import ClassicMyTodo from "./classic-view";
import * as actions from "./workspace-actions";
import { fetchMyTicketDescriptionAction } from "./actions";
import s from "@/components/my-todo/workspace.module.css";

export const dynamic = "force-dynamic";
type Params = {
  view?: string;
  tab?: string;
  client?: string;
  priority?: string | string[];
  status?: string | string[];
  sort?: string;
  dir?: string;
  month?: string;
};
export default async function MyTodoPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requireStaff();
  if (!user) redirect("/login");
  const db = await createClient();
  const params = await searchParams;
  const { data } = await db
    .from("my_todo_workspaces")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();
  const preferences = normalizePreferences(data?.preferences);
  const view =
    params.view === "old" || params.view === "new"
      ? params.view
      : preferences.view;
  if (view === "old")
    return (
      <>
        <div className={s.workspace}>
          <div className={s.topbar}>
            <div className={s.breadcrumb}>
              Workspace <span>/</span>
              <strong>My To-Do</strong>
            </div>
            <TodoViewSwitch
              view="old"
              preferences={preferences}
              save={actions.saveTodoPreferences}
            />
          </div>
        </div>
        <ClassicMyTodo searchParams={Promise.resolve(params)} />
      </>
    );
  const result = await actions.loadTodoWorkspace();
  if (result.error !== undefined)
    return (
      <div className={s.workspace}>
        <h1>My To-Do</h1>
        <p role="alert" className={s.error}>
          {result.error}
        </p>
        <a className={s.button} href="/my-todo?view=new">
          Retry
        </a>{" "}
        <a className={s.button} href="/my-todo?view=old">
          Old view
        </a>
      </div>
    );
  const api: TodoActions = {
    notes: actions.loadTodoNotes,
    addNote: actions.addTodoNote,
    refresh: actions.loadTodoWorkspace,
    preferences: actions.saveTodoPreferences,
    plan: actions.planTodoItem,
    create: actions.createTodoTask,
    update: actions.updateTodoTask,
    inbox: actions.loadTodoInbox,
    review: actions.reviewTodoInbox,
    sync: actions.syncTodoInbox,
    dismiss: actions.dismissTodoThread,
    tickets: actions.loadTodoTickets,
    ticketDetail: fetchMyTicketDescriptionAction,
    agenda: actions.loadTodoAgenda,
    time: actions.loadTodoTime,
    hours: actions.saveTodoHours,
    leave: actions.createTodoLeave,
    decideLeave: actions.decideTodoLeave,
    withdrawLeave: actions.withdrawTodoLeave,
    leaveNote: actions.addTodoLeaveNote,
  };
  return <TodoWorkspace initial={result.data} actions={api} />;
}
