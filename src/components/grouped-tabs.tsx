"use client";

import { useState } from "react";

export type GroupedTab = { label: string; content: React.ReactNode };
export type TabGroup = { group: string; tabs: GroupedTab[] };

// Group name + label, not the label alone — two different groups can
// legitimately reuse the same tab label (e.g. "Block of Hours Usage
// Report" appears under both Notifications and Email Templates), and
// tracking/matching by bare label meant clicking either one just showed
// whichever came first in the flattened list, with both buttons
// highlighted as active at once.
function tabId(group: string, label: string): string {
  return `${group}::${label}`;
}

/** Vertical, vendor-grouped navigation for pages with too many tabs for a
 * single horizontal row to stay usable (Lookups/Analysis both grew past
 * a dozen). Stacks to a horizontal-on-top layout below the lg breakpoint
 * so a narrow viewport doesn't squeeze a sidebar into nothing. */
export function GroupedTabs({ groups }: { groups: TabGroup[] }) {
  const firstGroup = groups[0];
  const firstTab = firstGroup?.tabs[0];
  const [active, setActive] = useState(firstTab ? tabId(firstGroup.group, firstTab.label) : "");
  const activeContent = groups
    .flatMap((g) => g.tabs.map((t) => ({ id: tabId(g.group, t.label), content: t.content })))
    .find((t) => t.id === active)?.content;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="space-y-4 lg:w-56 lg:shrink-0">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.group}</p>
            <div className="space-y-0.5">
              {g.tabs.map((t) => {
                const id = tabId(g.group, t.label);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActive(id)}
                    className={`block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium ${
                      active === id ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {/* key={active} forces a full remount on every tab switch - without
          it, React sees the same element type/position across switches (a
          ReportPreviewPanel replaced by another ReportPreviewPanel, say)
          and reuses the existing instance with its old state instead of
          mounting fresh, which is why a tab's own mount-time effects (e.g.
          auto-loading its preview) only ever fired once, on the very first
          tab ever opened. */}
      <div key={active} className="min-w-0 flex-1 space-y-6">
        {activeContent}
      </div>
    </div>
  );
}
