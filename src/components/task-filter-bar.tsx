"use client";

// A plain GET form, auto-submitting on change — same "filtered view is a
// real URL, filtering happens in the query" approach as the other list
// pages' filters. `mine`/`view` (the existing Open/My tasks/All chips)
// come along as hidden inputs so changing a dropdown here doesn't reset
// them. Status is a checkbox group (name="status" repeated) rather than a
// single-select dropdown, so one or more statuses can be highlighted at
// once — same pattern as Internal Sales' stage filter.
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
  values: { client: string; priority: string; assignee: string; statuses: string[] };
  preserve: { mine?: string; view?: string };
  /** Where "Clear filters" goes — computed server-side so it can drop the
   * filter params while keeping mine/view (the Open/My tasks/All chips)
   * intact. */
  clearHref: string;
}) {
  const hasFilters =
    values.client || values.priority || values.assignee || values.statuses.length > 0;

  return (
    <form action="/tasks" className="space-y-2">
      {preserve.mine && <input type="hidden" name="mine" value={preserve.mine} />}
      {preserve.view && <input type="hidden" name="view" value={preserve.view} />}

      <div className="flex flex-wrap items-center gap-2 text-sm">
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

        {hasFilters && (
          <a href={clearHref} className="text-xs text-slate-500 underline">
            Clear filters
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {statusOptions.map((s) => {
          const checked = values.statuses.includes(s.value);
          return (
            <label
              key={s.value}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                checked
                  ? "bg-charcoal text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <input
                type="checkbox"
                name="status"
                value={s.value}
                defaultChecked={checked}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="sr-only"
              />
              {s.label}
            </label>
          );
        })}
      </div>
    </form>
  );
}
