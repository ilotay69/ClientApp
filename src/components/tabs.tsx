"use client";

import { useState } from "react";

export function Tabs({
  tabs,
  defaultActive = 0,
  orientation = "horizontal",
  navigationFooter,
}: {
  /** Optional secondary controls beneath a vertical tab list. */
  navigationFooter?: React.ReactNode;
  tabs: { label: string; content: React.ReactNode }[];
  /** Which tab to start on — pass this from a URL param when a form on
   * one of the tabs does a full GET navigation (e.g. a filter bar), so
   * that submission doesn't silently bounce back to the first tab. */
  defaultActive?: number;
  /** "vertical" puts the tab list in a left rail (like the Quarterly
   * Review detail page's section nav) instead of a horizontal bar above
   * the content — for a page with enough tabs, or wide enough content,
   * that a top bar starts to feel cramped. Defaults to the original
   * horizontal bar so existing callers are unaffected. */
  orientation?: "horizontal" | "vertical";
}) {
  const [active, setActive] = useState(defaultActive);

  if (orientation === "vertical") {
    return (
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav className="shrink-0 lg:sticky lg:top-4 lg:w-48">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {tabs.map((t, i) => (
              <li key={t.label} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={`w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium ${
                    active === i
                      ? "bg-brand text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
          {navigationFooter && <div className="mt-4">{navigationFooter}</div>}
        </nav>
        <div className="min-w-0 flex-1 space-y-6">{tabs[active].content}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 overflow-x-auto border-b border-slate-200">
        <div className="flex w-max gap-1">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setActive(i)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap ${
                active === i
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-6">{tabs[active].content}</div>
    </div>
  );
}
