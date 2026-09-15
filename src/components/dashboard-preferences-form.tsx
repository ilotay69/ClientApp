"use client";

import { useActionState, useState } from "react";
import type { DashboardWidgetDef, DashboardWidgetKey } from "@/lib/dashboard-widgets";

type FormState = { error: string | null; success: string | null };
const initialState: FormState = { error: null, success: null };

export function DashboardPreferencesForm({
  widgets,
  enabledKeys,
  saveAction,
}: {
  widgets: DashboardWidgetDef[];
  enabledKeys: DashboardWidgetKey[];
  saveAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const byKey = new Map(widgets.map((w) => [w.key, w]));

  // Saved order first (only keys still actually available), then anything
  // eligible but never explicitly ordered yet, in catalog order — so a
  // widget this app gains later doesn't just vanish from an existing
  // preference's ordering, it shows up at the bottom instead. The list
  // itself carries every widget (checked or not) so unchecking one
  // doesn't lose its position — only checked ones actually get submitted.
  const [order, setOrder] = useState<DashboardWidgetKey[]>(() => [
    ...enabledKeys.filter((k) => byKey.has(k)),
    ...widgets.map((w) => w.key).filter((k) => !enabledKeys.includes(k)),
  ]);
  const [enabled, setEnabled] = useState<Set<DashboardWidgetKey>>(() => new Set(enabledKeys));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggle = (key: DashboardWidgetKey) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs text-slate-500">
        Checked widgets show on your Dashboard, top to bottom in this order — use the arrows to
        move one up or down.
      </p>
      {order.map((key, i) => {
        const w = byKey.get(key);
        if (!w) return null;
        return (
          <div
            key={w.key}
            className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              name="widgets"
              value={w.key}
              checked={enabled.has(w.key)}
              onChange={() => toggle(w.key)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{w.label}</p>
              <p className="text-xs text-slate-500">{w.description}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${w.label} up`}
                className="rounded border border-slate-300 px-1.5 py-0.5 text-xs leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label={`Move ${w.label} down`}
                className="rounded border border-slate-300 px-1.5 py-0.5 text-xs leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </div>
        );
      })}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-700">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
