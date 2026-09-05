import Link from "next/link";

// Filter chips are plain links over URL search params rather than client
// state: the filtered view stays shareable/bookmarkable, survives a refresh,
// and the filtering itself happens in the Supabase query on the server, so a
// long list never has to reach the browser just to be hidden.
export function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-md px-3 py-1.5 ${
        active
          ? "bg-charcoal text-white"
          : "border border-slate-300 text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </Link>
  );
}

/** Builds a querystring from the current params plus an override, dropping
 * empty values so the default view stays at a clean URL. An array value
 * (e.g. multi-select stage/status/priority chips) appends one entry per
 * item under the same key. */
export function filterHref(
  base: string,
  params: Record<string, string | string[] | undefined>
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item);
    } else if (v) {
      qs.set(k, v);
    }
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
