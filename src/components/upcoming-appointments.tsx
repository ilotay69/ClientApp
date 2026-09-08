"use client";

import { useState, useTransition } from "react";
import type { UpcomingAppointment } from "@/app/(dashboard)/dashboard/actions";

function formatWhen(a: UpcomingAppointment): string {
  const start = new Date(a.startIso);
  const datePart = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (a.isAllDay) return `${datePart} (all day)`;
  const timePart = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

export function UpcomingAppointments({
  action,
}: {
  action: () => Promise<{ appointments: UpcomingAppointment[] } | { error: string }>;
}) {
  const [appointments, setAppointments] = useState<UpcomingAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const load = () => {
    setError(null);
    startLoad(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        setAppointments(null);
      } else {
        setAppointments(result.appointments);
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Upcoming appointments</h2>
          <p className="text-xs text-slate-500">Your calendar for the next 2 weeks.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : appointments ? "Refresh" : "Load appointments"}
        </button>
      </div>

      {error && <p className="border-b border-slate-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</p>}

      {appointments && (
        <div className="divide-y divide-slate-100">
          {appointments.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 px-5 py-2.5">
              <div>
                {a.webLink ? (
                  <a href={a.webLink} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-900 hover:underline">
                    {a.subject}
                  </a>
                ) : (
                  <p className="text-sm font-medium text-slate-900">{a.subject}</p>
                )}
                <p className="text-xs text-slate-500">
                  {a.location ? `${a.location} — ` : ""}
                  {a.organizerName ?? "Unknown organizer"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{formatWhen(a)}</span>
            </div>
          ))}
          {appointments.length === 0 && (
            <p className="px-5 py-4 text-center text-sm text-slate-500">Nothing on your calendar in the next 2 weeks.</p>
          )}
        </div>
      )}
    </div>
  );
}
