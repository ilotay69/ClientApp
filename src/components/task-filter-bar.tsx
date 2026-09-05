"use client";

// A plain GET form, auto-submitting on change — same "filtered view is a
// real URL, filtering happens in the query" approach as the other list
// pages' filters. Priority and status are both checkbox groups (repeated
// `name`) rather than single-select dropdowns, so one or more of either
// can be highlighted at once — same pattern as Internal Sales' stage
// filter. Reused for both Team Tasks and My To-Do (which has no assignee
// concept and uses its own `todo*`-prefixed query params so the two
// tabs' filters don't collide) — `fieldNames` remaps the form field
// names, `showAssignee` toggles the assignee dropdown.
function Chip({
  name,
  option,
  checked,
}: {
  name: string;
  option: { value: string; label: string };
  checked: boolean;
}) {
  return (
    <label
      className={`cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
        checked
          ? "bg-charcoal text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value={option.value}
        defaultChecked={checked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="sr-only"
      />
      {option.label}
    </label>
  );
}

/** Hidden inputs that carry forward whatever isn't this form's own
 * field(s) — otherwise submitting one tab's filter form would wipe the
 * other tab's params out of the URL. */
function PreserveParams({ params }: { params: Record<string, string | string[] | undefined> }) {
  return (
    <>
      {Object.entries(params).flatMap(([key, value]) => {
        if (value === undefined) return [];
        const values = Array.isArray(value) ? value : [value];
        return values.map((v, i) => (
          <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
        ));
      })}
    </>
  );
}

const DEFAULT_FIELD_NAMES = {
  client: "client",
  priority: "priority",
  status: "status",
  assignee: "assignee",
};

export function TaskFilterBar({
  clients,
  members,
  priorityOptions,
  statusOptions,
  values,
  preserve,
  clearHref,
  fieldNames = DEFAULT_FIELD_NAMES,
  showAssignee = true,
}: {
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
  priorityOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  values: { client: string; priorities: string[]; assignee: string; statuses: string[] };
  /** Every other filter param (from either tab) so it survives this
   * form's own submission — see `PreserveParams`. */
  preserve: Record<string, string | string[] | undefined>;
  /** Where "Clear filters" goes — computed server-side so it can drop
   * this tab's filter params while keeping everything else intact. */
  clearHref: string;
  fieldNames?: { client: string; priority: string; status: string; assignee: string };
  showAssignee?: boolean;
}) {
  const hasFilters =
    values.client ||
    values.priorities.length > 0 ||
    (showAssignee && values.assignee) ||
    values.statuses.length > 0;

  return (
    <form action="/tasks" className="space-y-2">
      <PreserveParams params={preserve} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          name={fieldNames.client}
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

        {showAssignee && (
          <select
            name={fieldNames.assignee}
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
        )}

        {hasFilters && (
          <a href={clearHref} className="text-xs text-slate-500 underline">
            Clear filters
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {priorityOptions.map((o) => (
          <Chip
            key={`priority-${o.value}`}
            name={fieldNames.priority}
            option={o}
            checked={values.priorities.includes(o.value)}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        {statusOptions.map((o) => (
          <Chip
            key={`status-${o.value}`}
            name={fieldNames.status}
            option={o}
            checked={values.statuses.includes(o.value)}
          />
        ))}
      </div>
    </form>
  );
}
