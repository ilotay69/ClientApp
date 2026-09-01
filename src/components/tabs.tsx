"use client";

import { useState } from "react";

export function Tabs({ tabs }: { tabs: { label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setActive(i)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              active === i
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-6">{tabs[active].content}</div>
    </div>
  );
}
