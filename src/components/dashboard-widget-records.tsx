"use client";

import { useState, type RefObject } from "react";
import Link from "next/link";
import type { WidgetRowData } from "@/lib/dashboard-workspace";
import { AnimatedDialog } from "./ui/animated-dialog";
import styles from "./dashboard-widget-records.module.css";

export function safeWidgetHref(href?: string) {
  return href && (/^\/(?!\/)/.test(href) || /^https:\/\//.test(href))
    ? href
    : undefined;
}

/** Shared, read-only record drill-down. Filtering uses the same snapshot as the chart. */
export function DashboardWidgetRecords({
  title,
  category,
  rows,
  recordsLabel = "records",
  sourceHref,
  onClose,
  finalFocus,
}: {
  title: string;
  category?: string;
  rows: WidgetRowData[];
  recordsLabel?: string;
  sourceHref?: string;
  onClose: () => void;
  finalFocus: RefObject<HTMLElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = search.trim().toLocaleLowerCase();
  const matches = rows.filter((row) =>
    [row.title, row.detail, row.badge].some((value) =>
      value?.toLocaleLowerCase().includes(query),
    ),
  );
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = matches.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const href = safeWidgetHref(sourceHref);
  return (
    <AnimatedDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={category ? `${title} · ${category}` : title}
      description={`${rows.length} ${recordsLabel} · ${category ? "Selected category" : "All categories"} · Current snapshot`}
      className={styles.modal}
      bodyClassName={styles.body}
      finalFocus={finalFocus}
    >
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span className={styles.srOnly}>Search this list</span>
          <input
            type="search"
            placeholder="Search this list…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        {href && (
          <Link className={styles.source} href={href}>
            Open source ↗
          </Link>
        )}
      </div>
      <div className={styles.listArea}>
        {visible.length ? (
          <ul
            className={styles.rows}
            aria-label={category ? `${category} records` : "All records"}
          >
            {visible.map((row) => {
              const link = safeWidgetHref(row.href);
              return (
                <li key={row.id}>
                  <div>
                    {link ? (
                      <Link href={link}>{row.title}</Link>
                    ) : (
                      <strong>{row.title}</strong>
                    )}
                    {row.detail && <p>{row.detail}</p>}
                  </div>
                  {row.badge && (
                    <span className={styles.badge} data-urgent={row.urgent}>
                      {row.badge}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={styles.empty}>
            {query
              ? "No records match your search."
              : "No records in this category."}
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <span role="status">
          {matches.length
            ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, matches.length)} of ${matches.length}`
            : "0 records"}
          {query ? " matching" : ""}
        </span>
        {pages > 1 && (
          <nav aria-label="Record pages">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              disabled={currentPage === pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </nav>
        )}
        <button onClick={onClose}>Done</button>
      </footer>
    </AnimatedDialog>
  );
}
