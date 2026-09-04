"use client";

// Same "filtered view is a real URL" plain GET auto-submit approach as
// TaskFilterBar.
export function SalesRequestFilterBar({
  clients,
  members,
  stageOptions,
  values,
  clearHref,
}: {
  clients: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
  stageOptions: { value: string; label: string }[];
  values: { client: string; stage: string; assignee: string; source: string };
  clearHref: string;
}) {
  const hasFilters = values.client || values.stage || values.assignee || values.source;

  return (
    <form action="/sales-requests" className="flex flex-wrap items-center gap-2 text-sm">
      <select
        name="client"
        defaultValue={values.client}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">All clients</option>
        <option value="none">Internal only</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        name="stage"
        defaultValue={values.stage}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">Any stage</option>
        {stageOptions.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
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
        name="source"
        defaultValue={values.source}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
      >
        <option value="">Any source</option>
        <option value="manual">Manual</option>
        <option value="mailbox_ai">Mailbox AI</option>
      </select>

      {hasFilters && (
        <a href={clearHref} className="text-xs text-slate-500 underline">
          Clear filters
        </a>
      )}
    </form>
  );
}
