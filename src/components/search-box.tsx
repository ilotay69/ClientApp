import { IconSearch } from "@/components/icons";

// A plain GET form — submitting navigates to ?q=…, which the page reads as a
// search param and applies server-side. No client JS, and the searched view is
// a real URL like every other filter here.
//
// `keep` carries the other active filters through as hidden inputs so
// searching doesn't silently reset them.
export function SearchBox({
  action,
  placeholder = "Search…",
  defaultValue,
  keep = {},
}: {
  action: string;
  placeholder?: string;
  defaultValue?: string;
  keep?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} className="relative">
      {Object.entries(keep).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null
      )}
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-slate-300 py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:w-64"
      />
    </form>
  );
}
