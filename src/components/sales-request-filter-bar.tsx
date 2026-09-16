"use client";

import { useRef, useState } from "react";
import { ClientCombobox } from "@/components/client-combobox";

// Same "filtered view is a real URL" plain GET auto-submit approach as
// TaskFilterBar. Stage is a checkbox group (name="stage" repeated) rather
// than a single-select dropdown, so one or more stages can be highlighted
// at once — submitting sends multiple `stage` values in the querystring.
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
  values: { client: string; stages: string[]; assignee: string; source: string };
  clearHref: string;
}) {
  const hasFilters =
    values.client || values.stages.length > 0 || values.assignee || values.source;
  const formRef = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState(values.client);

  return (
    <form ref={formRef} action="/sales-requests" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="client" value={clientId} />
        <ClientCombobox
          clients={clients}
          value={clientId}
          onChange={(id) => {
            setClientId(id);
            // Deferred a tick so the hidden input above has actually
            // picked up the new value before the form reads it — setting
            // state and submitting in the same handler would still submit
            // the previous render's value.
            setTimeout(() => formRef.current?.requestSubmit());
          }}
          emptyLabel="All clients"
          extraOptions={[{ value: "none", label: "Internal only" }]}
          className="w-56"
        />

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
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {stageOptions.map((s) => {
          const checked = values.stages.includes(s.value);
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
                name="stage"
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
