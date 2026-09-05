import { IconChevronDown } from "@/components/icons";

// The card shell used by every section on a client's "Services & Devices"
// tab. Built on native <details>/<summary> rather than useState so it works
// in Server Components (most of these sections are server-rendered) and gets
// keyboard support + open/close semantics from the browser for free.
//
// `count` matters more than it looks: with sections collapsed by default,
// the header is the only thing telling you whether it's worth expanding, so
// every caller should pass one.
export function CollapsibleCard({
  title,
  count,
  headerRight,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number | null;
  /** Stays visible while collapsed — for a headline figure worth seeing
   * without expanding, like a Secure Score total. */
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-2 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {count !== null && count !== undefined && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {count}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {headerRight}
          <IconChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-slate-200">{children}</div>
    </details>
  );
}
