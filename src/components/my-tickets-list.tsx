"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";
import type { MyOpenTicketRow } from "@/lib/my-tickets";

type DescriptionResult = { description: string | null } | { error: string };

export function MyTicketsList({
  tickets,
  descriptionAction,
}: {
  tickets: MyOpenTicketRow[];
  descriptionAction: (ticketId: number) => Promise<DescriptionResult>;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [descriptions, setDescriptions] = useState<Map<number, DescriptionResult | "loading">>(new Map());

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

  return (
    <div className="divide-y divide-slate-100">
      {tickets.map((t) => {
        const expanded = expandedId === t.id;
        const description = descriptions.get(t.id);
        return (
          <div key={t.id}>
            <button
              type="button"
              onClick={() => toggleExpand(t.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {t.ticketNumber ? `#${t.ticketNumber} — ` : ""}
                  {t.title}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {t.clientName ?? "Unknown client"}
                  {t.queueName ? ` · ${t.queueName}` : ""}
                  {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.priority && <Badge value={t.priority} />}
                {t.status && <Badge value={t.status} />}
              </div>
            </button>
            {expanded && (
              <div className="bg-slate-50 px-5 py-3">
                {description === undefined || description === "loading" ? (
                  <p className="text-sm text-slate-500">Loading description…</p>
                ) : "error" in description ? (
                  <p className="text-sm text-red-600">{description.error}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-slate-700">
                    {description.description || "No description on this ticket."}
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-3">
                  {t.openedAt && (
                    <div>
                      <dt className="font-medium text-slate-600">Opened</dt>
                      <dd>{formatDate(t.openedAt)}</dd>
                    </div>
                  )}
                  {t.lastActivityAt && (
                    <div>
                      <dt className="font-medium text-slate-600">Last activity</dt>
                      <dd>{formatDate(t.lastActivityAt)}</dd>
                    </div>
                  )}
                  {t.dueDate && (
                    <div>
                      <dt className="font-medium text-slate-600">Due</dt>
                      <dd>{formatDate(t.dueDate)}</dd>
                    </div>
                  )}
                </dl>
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
