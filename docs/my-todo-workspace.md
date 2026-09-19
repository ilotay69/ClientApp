# My To-Do workspace

The new view is a light, personal workbench. The sidebar is unchanged. The original page is preserved in `my-todo/classic-view.tsx`; the account preference and `?view=old|new` choose the renderer.

## Views

- **Today:** private and assigned tasks planned for today, drag reorder plus keyboard move buttons, earlier plans, due/overdue attention, snooze, completed-plan disclosure, planned Autotask tickets, and calendar agenda. Planning and snooze never write deadlines.
- **Tasks:** private tasks plus primary/secondary assignments, search, ownership/status/client/priority filters, grouping, list/board, up to 12 named saved views, selection/bulk planning/completion, optimistic completion with rollback and undo, resizable task details, discussion, and explicit no-due-date creation.
- **Inbox:** the user's stored mailbox snapshot, last-sync time, received/waiting classification based on message direction, explicit AI analysis, source links, review/don't-store settings, snooze/dismiss/restore, and confirmed private task creation. No automatic email or ticket writes. A newer message resurfaces a previously dismissed or snoozed conversation.
- **Tickets:** live primary and secondary Autotask assignments, search and filters, lazy description, personal Today pinning. Updates/completion remain in Autotask. Description actions recheck assignment server-side.
- **Time & leave:** editable weekly hours across month boundaries, existing semi-monthly payroll totals, negative Taken Off, leave requests/discussion, owner decisions and read-only team hours. Team availability is sanitized to names/dates, without leave types or reasons. Existing sick-leave automatic recording is preserved.

## Persistence and privacy

Apply `supabase/155_my_todo_workspaces.sql` before deploying. The migration is additive; it does not alter existing tasks or deadlines. `my_todo_workspaces` stores account preferences and saved views; `my_todo_item_state` stores personal planning/snooze; `my_todo_mail_tasks` links one conversation to one private task. All new tables use own-user staff-only RLS.

The mail-task RPC validates the signed-in staff identity and source-message ownership and uses a transaction-level advisory lock to prevent duplicate tasks. Its narrow definer scope is necessary to write the read-only-to-clients source-link table. It never creates a shared task. Task edits recheck access and use `updated_at` as a concurrency guard. Assigned-task edits are shared changes; the panel explicitly labels this.

Section, task selection, task filters, grouping and layout use URL state. Saved views, appearance, density, column visibility, panel width and planning persist to Supabase per account. Inbox/ticket queries load only when those sections open; the agenda loads in Today. Mailbox AI analysis only runs on an explicit click. Preview and test data are not included in production code.

Base UI provides focus-managed panels. Motion provides single-axis plan reordering. All essential actions have keyboard alternatives, and reduced-motion preferences disable animations. No gooey effects are used in the workbench.

## Verification

Run `node --test tests/my-todo-workspace.test.mjs` using Node 24, targeted ESLint, TypeScript, and the Next production build. Test Today ordering/completion/undo, new private task/no deadline, filters/board, task-panel resize and Escape, Inbox source-linked task creation and snooze/dismiss, read-only ticket details, weekly hours and mobile layout.

Mailbox lists are bounded to the newest 1,000 stored messages and show a truncation notice. Task assignments are bounded to 1,000 per query with an explicit notice. Old view remains available if an integration is unavailable. Mailbox privacy exclusion changes require an explicit confirmation because they can remove cached message snapshots (not Outlook messages).
