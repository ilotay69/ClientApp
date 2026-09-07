"use client";

import { useState } from "react";

export type GroupedTab = { label: string; content: React.ReactNode };
export type TabGroup = { group: string; tabs: GroupedTab[] };

/** Vertical, vendor-grouped navigation for pages with too many tabs for a
 * single horizontal row to stay usable (Lookups/Analysis both grew past
 * a dozen). Stacks to a horizontal-on-top layout below the lg breakpoint
 * so a narrow viewport doesn't squeeze a sidebar into nothing. */
export function GroupedTabs({ groups }: { groups: TabGroup[] }) {
  const firstLabel = groups[0]?.tabs[0]?.label ?? "";
  const [active, setActive] = useState(firstLabel);
  const activeContent = groups.flatMap((g) => g.tabs).find((t) => t.label === active)?.content;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="space-y-4 lg:w-56 lg:shrink-0">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.group}</p>
            <div className="space-y-0.5">
              {g.tabs.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setActive(t.label)}
                  className={`block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium ${
                    active === t.label ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-6">{activeContent}</div>
    </div>
  );
}
