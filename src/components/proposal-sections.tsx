"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type ProposalSection = { id: string; heading: string; body: string | null };

type SectionsContextValue = {
  sections: ProposalSection[];
  activeId: string | null;
  selectSection: (id: string) => void;
};

const SectionsContext = createContext<SectionsContextValue | null>(null);

function useSections(): SectionsContextValue {
  const ctx = useContext(SectionsContext);
  if (!ctx) throw new Error("Proposal section components must be rendered inside ProposalSectionsProvider.");
  return ctx;
}

/** Anchor the viewport lands on when someone picks a different section.
 * A DOM id rather than a ref through context: the element is the same one
 * across every switch, only its contents change. */
const VIEW_ANCHOR_ID = "proposal-section-view";

/** The prospect reads one section at a time rather than scrolling a single
 * long document — the rail (desktop) and the dropdown (mobile) both switch
 * what the content column shows. Pricing is deliberately NOT one of these
 * sections; it stays pinned below whatever is selected, so there is no way
 * to read a section and not see the way to accept. */
export function ProposalSectionsProvider({
  sections,
  className,
  children,
}: {
  sections: ProposalSection[];
  /** Applied to the element this renders — it stands in for the layout
   * wrapper it replaces, rather than adding a second nested div, since it
   * has to enclose both the rail and the content column. */
  className?: string;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  const value = useMemo<SectionsContextValue>(
    () => ({
      sections,
      activeId,
      selectSection: (id: string) => {
        setActiveId(id);
        // The swapped-in section starts at the top of the reading area
        // rather than wherever the last one happened to leave the scroll
        // position, which on a phone is usually mid-paragraph.
        document.getElementById(VIEW_ANCHOR_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }),
    [sections, activeId]
  );

  return (
    <SectionsContext.Provider value={value}>
      <div className={className}>{children}</div>
    </SectionsContext.Provider>
  );
}

/** Sticky left rail, desktop only — a phone has no room for a permanent
 * side rail, which is what ProposalSectionPicker covers instead. */
export function ProposalSectionNav() {
  const { sections, activeId, selectSection } = useSections();
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
                <button
                  type="button"
                  onClick={() => selectSection(s.id)}
                  aria-current={active ? "true" : undefined}
                  className={`-ml-px block w-full border-l-2 py-1.5 pl-3.5 pr-2 text-left text-sm transition-colors ${
                    active
                      ? "border-brand font-semibold text-brand-dark"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  <span className="mr-2 tabular-nums text-xs text-slate-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.heading}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/** The mobile counterpart to the rail. A native select on purpose: it gets
 * the platform's own picker, which is a better target on a phone than
 * anything drawn by hand. */
export function ProposalSectionPicker() {
  const { sections, activeId, selectSection } = useSections();
  if (sections.length === 0) return null;

  return (
    <div className="mt-10 lg:hidden">
      <label
        htmlFor="proposal-section-picker"
        className="block text-xs font-bold uppercase tracking-wider text-slate-400"
      >
        On this proposal
      </label>
      <select
        id="proposal-section-picker"
        value={activeId ?? ""}
        onChange={(e) => selectSection(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 focus:border-brand focus:outline-none"
      >
        {sections.map((s, i) => (
          <option key={s.id} value={s.id}>
            {String(i + 1).padStart(2, "0")} — {s.heading}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Whichever section is currently selected. Same card treatment the
 * stacked sections used to have, so the page reads identically — it just
 * shows one at a time now. */
export function ProposalActiveSection() {
  const { sections, activeId } = useSections();
  if (sections.length === 0) return null;

  const index = Math.max(
    0,
    sections.findIndex((s) => s.id === activeId)
  );
  const section = sections[index];
  if (!section) return null;

  return (
    <div id={VIEW_ANCHOR_ID} className="mt-8 scroll-mt-24">
      <section className="rounded-2xl border border-slate-200 p-6 sm:p-8">
        <div className="flex items-center gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold tabular-nums text-brand-dark">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.heading}</h2>
        </div>
        {section.body?.trim() && (
          <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-slate-700">{section.body}</p>
        )}
      </section>

      {sections.length > 1 && (
        <p className="mt-3 px-1 text-xs text-slate-400">
          Section {index + 1} of {sections.length}. Pricing is below, whichever section you are reading.
        </p>
      )}
    </div>
  );
}
