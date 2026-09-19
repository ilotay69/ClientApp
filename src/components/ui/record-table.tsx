"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AnimatedDialog } from "./animated-dialog";
import { CGSelect } from "./cg-select";
import { CGActionPopover } from "./action-popover";
import s from "./client-surfaces.module.css";

export type RecordColumn = { key: string; label: string };
export type WorkspaceRecord = {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  values: Record<string, string | number | null>;
  sortValues?: Record<string, string | number | null>;
  details?: { label: string; value: string | number | null }[];
};
/** A small headless CG record table. Stable rows, explicit detail actions,
 * keyboard-sortable columns and pagination; no table-sized animation. */
export function CGRecordTable({
  rows,
  columns,
  label,
  empty = "No records to show.",
  renderDetail,
  tools,
  quickFilters = [],
}: {
  rows: WorkspaceRecord[];
  columns: RecordColumn[];
  label: string;
  empty?: string;
  renderDetail?: (row: WorkspaceRecord) => ReactNode;
  tools?: ReactNode;
  quickFilters?: { id: string; label: string; rowIds: string[] }[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "title", ascending: true });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const statusColumn = columns.find((column) =>
    /status|state|priority|compliance/i.test(column.key),
  );
  const filters = statusColumn
    ? [
        ...new Set(
          rows.map((row) => String(row.values[statusColumn.key] ?? "Unknown")),
        ),
      ].sort()
    : [];
  const activeQuickFilter = quickFilters.find(
    (item) => item.id === quickFilter,
  );
  const visible = rows
    .filter(
      (row) =>
        (!activeQuickFilter || activeQuickFilter.rowIds.includes(row.id)) &&
        (!filter ||
          String(row.values[statusColumn!.key] ?? "Unknown") === filter) &&
        [row.title, row.subtitle, ...Object.values(row.values)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => {
      const first =
        sort.key === "title"
          ? a.title
          : (a.sortValues?.[sort.key] ?? a.values[sort.key]);
      const second =
        sort.key === "title"
          ? b.title
          : (b.sortValues?.[sort.key] ?? b.values[sort.key]);
      const delta =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first ?? "").localeCompare(String(second ?? ""), undefined, {
              numeric: true,
            });
      return sort.ascending ? delta : -delta;
    });
  const pages = Math.max(1, Math.ceil(visible.length / 25));
  const current = Math.min(page, pages);
  const detail = rows.find((row) => row.id === selected);
  const shownColumns = columns.filter((column) => !hidden.includes(column.key));
  function sortBy(key: string) {
    setSort({ key, ascending: key !== sort.key || !sort.ascending });
    setPage(1);
  }
  const heading = (key: string, text: string) => (
    <th
      key={key}
      aria-sort={
        sort.key === key
          ? sort.ascending
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button onClick={() => sortBy(key)}>
        {text}
        <span aria-hidden="true">
          {sort.key === key ? (sort.ascending ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
  return (
    <div className={s.stack}>
      <div className={s.toolbar}>
        <input
          className={`${s.input} ${s.search}`}
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${label.toLowerCase()}…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        {statusColumn && filters.length > 1 && (
          <CGSelect
            label={`Filter by ${statusColumn.label.toLowerCase()}`}
            value={filter}
            options={[
              { value: "", label: `All ${statusColumn.label.toLowerCase()}` },
              ...filters.map((value) => ({ value, label: value })),
            ]}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
          />
        )}
        {!!columns.length && (
          <CGActionPopover label="Columns" title="Visible columns">
            {columns.map((column) => (
              <label key={column.key} className={s.row}>
                <span>{column.label}</span>
                <input
                  type="checkbox"
                  checked={!hidden.includes(column.key)}
                  onChange={(e) =>
                    setHidden(
                      e.target.checked
                        ? hidden.filter((key) => key !== column.key)
                        : [...hidden, column.key],
                    )
                  }
                />
              </label>
            ))}
          </CGActionPopover>
        )}
        {tools}
      </div>
      {!!quickFilters.length && (
        <div
          className={s.toolbar}
          role="group"
          aria-label={`${label} quick filters`}
        >
          {quickFilters.map((item) => (
            <button
              key={item.id}
              className={s.button}
              aria-pressed={quickFilter === item.id}
              onClick={() => {
                setQuickFilter(quickFilter === item.id ? "" : item.id);
                setPage(1);
              }}
            >
              {item.label} ({item.rowIds.length})
            </button>
          ))}
        </div>
      )}
      <div
        className={s.tableWrap}
        role="region"
        aria-label={`${label} table`}
        tabIndex={0}
      >
        <table
          className={`${s.table} ${s.recordTable}`}
          style={{ minWidth: 240 + shownColumns.length * 130 }}
        >
          <caption className={s.srOnly}>{label}</caption>
          <thead>
            <tr>
              {heading("title", "Name")}
              {shownColumns.map((column) => heading(column.key, column.label))}
            </tr>
          </thead>
          <tbody>
            {visible.slice((current - 1) * 25, current * 25).map((row) => (
              <tr key={row.id}>
                <td>
                  {row.href ? (
                    <Link href={row.href} className={s.nameLink}>
                      {row.title}
                    </Link>
                  ) : (
                    <button
                      className={s.nameLink}
                      aria-label={`View ${row.title}`}
                      onClick={() => setSelected(row.id)}
                    >
                      {row.title}
                    </button>
                  )}
                  {row.subtitle && <p className={s.muted}>{row.subtitle}</p>}
                </td>
                {shownColumns.map((column) => (
                  <td key={column.key}>
                    {row.values[column.key] ?? "Not available"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className={s.empty}>
            {query || filter || quickFilter
              ? "No records match these filters."
              : empty}
          </div>
        )}
      </div>
      <div className={s.pagination}>
        <span>
          {visible.length} {label.toLowerCase()}
        </span>
        <div className={s.toolbar}>
          <button
            className={s.button}
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            className={s.button}
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      </div>
      <AnimatedDialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={detail?.title ?? "Record"}
        description={detail?.subtitle}
        variant="drawer"
        className={s.drawer}
      >
        {detail && (
          <div className={`${s.workspace} ${s.stack}`}>
            <dl className={s.detailList}>
              {(
                detail.details ??
                columns.map((column) => ({
                  label: column.label,
                  value: detail.values[column.key],
                }))
              ).map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value ?? "Not available"}</dd>
                </div>
              ))}
            </dl>
            {renderDetail?.(detail)}
          </div>
        )}
      </AnimatedDialog>
    </div>
  );
}
