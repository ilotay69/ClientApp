"use client";

// A plain GET form, auto-submitting on change — same "filtered view is a
// real URL, filtering happens in the query" approach as the other list
// pages' filters. `mine`/`view` (the existing Open/My tasks/All chips)
// come along as hidden inputs so changing a dropdown here doesn't reset
// them.
export function TaskFilterBar({
  clients,
  members,
  priorityOptions,
  statusOptions,
  values,
  preserve,
  clearHref,
}: {
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
  priorityOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  values: { client: string; priority: string; assignee: string; status: string };
  preserve: { mine?: string; view?: string };
  /** Where "Clear filters" goes — computed server-side so it can drop the
   * filter params while keeping mine/view (the Open/My tasks/All chips)
   * intact. */
  clearHref: string;
}) {
  const hasFilters = values.client || values.priority || values.assignee || values.status;

  return (
    <form action="/tasks" className="flex flex-wrap items-center gap-2 text-sm">
      {preserve.mine && <input type="hidden" name="mine" value={preserve.mine} />}
      {preserve.view && <input type="hidden" name="view" value={preserve.view} />}

      <select
        name="client"
        defaultValue={values.client}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        name="priority"
        defaultValue={values.priority}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">All priorities</option>
        {priorityOptions.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        name="assignee"
        defaultValue={values.assignee}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">Everyone</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>

      <select
        name="status"
        defaultValue={values.status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">Any status</option>
        {statusOptions.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {hasFilters && (
        <a href={clearHref} className="text-xs text-slate-500 underline">
          Clear filters
        </a>
      )}
    </form>
  );
}
