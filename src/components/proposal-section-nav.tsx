"use client";

import { useEffect, useState } from "react";

export type ProposalNavSection = { id: string; heading: string };

/** The sticky left-rail "read each section" nav — desktop only (a phone
 * has no room for a permanent side rail; scrolling straight through is
 * still the right experience there). Highlights whichever section is
 * currently in view via IntersectionObserver, not just whichever link was
 * last clicked, so scrolling by hand keeps the rail in sync too. */
export function ProposalSectionNav({ sections }: { sections: ProposalNavSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Multiple sections can be "intersecting" at once on a tall
        // viewport — the one nearest the top of the reading band (per
        // rootMargin below) is the one someone would call "what I'm
        // reading right now", so pick by smallest top offset rather than
        // just the first entry IntersectionObserver happens to report.
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id.replace(/^sec-/, ""));
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );

    const elements = sections
      .map((s) => document.getElementById(`sec-${s.id}`))
      .filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) return null;

  return (
    <nav aria-label="Proposal sections" className="hidden lg:block">
      <div className="lg:sticky lg:top-24">
        <p className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400">On this proposal</p>
        <ul className="mt-2 space-y-0.5 border-l border-slate-200">
          {sections.map((s, i) => {
            const active = activeId === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#sec-${s.id}`}
                  aria-current={active ? "true" : undefined}
                  className={`-ml-px block border-l-2 py-1.5 pl-3.5 pr-2 text-sm transition-colors ${
                    active
                      ? "border-brand font-semibold text-brand-dark"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  <span className="mr-2 tabular-nums text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                  {s.heading}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
