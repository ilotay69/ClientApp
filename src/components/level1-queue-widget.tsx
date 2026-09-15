"use client";

import { useEffect, useState } from "react";
import { IconAlertTriangle } from "@/components/icons";
import { formatAge, formatDateTime } from "@/lib/format";
import type { UnassignedLevel1Ticket } from "@/app/(dashboard)/dashboard/actions";

type ActionResult = { rows: UnassignedLevel1Ticket[] } | { error: string };
type DescriptionResult = { description: string | null } | { error: string };

export function Level1QueueWidget({
  action,
  descriptionAction,
}: {
  action: () => Promise<ActionResult>;
  descriptionAction: (ticketId: number) => Promise<DescriptionResult>;
}) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [descriptions, setDescriptions] = useState<Map<number, DescriptionResult | "loading">>(new Map());

  useEffect(() => {
    let cancelled = false;
    action().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = (ticketId: number) => {
    if (expandedId === ticketId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(ticketId);
    if (!descriptions.has(ticketId)) {
      setDescriptions((prev) => new Map(prev).set(ticketId, "loading"));
      descriptionAction(ticketId).then((result) => {
        setDescriptions((prev) => new Map(prev).set(ticketId, result));
      });
    }
  };

  const rows = state && "rows" in state ? state.rows : [];
  const visible = showAll ? rows : rows.slice(0, 5);

  return (
    <div className="relative rounded-2xl border border-red-100 bg-white shadow-sm transition-shadow hover:shadow-md lg:col-span-2">
      {state && "rows" in state && rows.length > 0 && (
        <span
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow ring-2 ring-white"
          title="Needs attention"
          aria-hidden="true"
        >
          !
        </span>
      )}
      <div className="flex items-center justify-between gap-2.5 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm">
            <IconAlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              Level 1 Queue - waiting for tech to pick up
            </p>
            <p className="truncate text-xs font-medium text-red-700/70">unassigned</p>
          </div>
        </div>
        <span className="shrink-0 text-3xl font-bold tabular-nums text-red-600">
          {state && "rows" in state ? rows.length : "—"}
        </span>
      </div>

      {!state ? (
        <p className="px-4 py-3 text-sm text-slate-500">Loading from Autotask…</p>
      ) : "error" in state ? (
        <p className="px-4 py-3 text-sm text-red-600">{state.error}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">Nothing unassigned in Level 1 right now.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Created</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Ticket#</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Client</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Contact</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Title</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((t) => (
                  <TicketRows
                    key={t.id}
                    ticket={t}
                    expanded={expandedId === t.id}
                    onToggle={() => toggleExpand(t.id)}
                    description={descriptions.get(t.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="w-full border-t border-slate-100 px-4 py-2 text-left text-xs font-medium text-brand hover:underline"
            >
              {showAll ? "Show fewer" : `Show ${rows.length - 5} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TicketRows({
  ticket: t,
  expanded,
  onToggle,
  description,
}: {
  ticket: UnassignedLevel1Ticket;
  expanded: boolean;
  onToggle: () => void;
  description: DescriptionResult | "loading" | undefined;
}) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-slate-50">
        <td className="whitespace-nowrap px-4 py-2 text-slate-600">
          {formatDateTime(t.openedAt)}
          <span className="ml-1.5 text-xs text-slate-400">({formatAge(t.openedAt)} ago)</span>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-slate-900">{t.ticketNumber ?? "—"}</td>
        <td className="px-4 py-2 text-slate-700">{t.clientName}</td>
        <td className="px-4 py-2 text-slate-700">{t.contactName ?? "—"}</td>
        <td className="px-4 py-2 text-slate-900">{t.title}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={5} className="px-4 py-3">
            {description === undefined || description === "loading" ? (
              <p className="text-sm text-slate-500">Loading description…</p>
            ) : "error" in description ? (
              <p className="text-sm text-red-600">{description.error}</p>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {description.description || "No description on this ticket."}
              </p>
            )}
            {t.ticketUrl && (
              <a
                href={t.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
              >
                Open in Autotask
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
