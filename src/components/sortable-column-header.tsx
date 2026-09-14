import Link from "next/link";

/** A plain link, not client state — same reasoning as FilterLink: the
 * sorted view stays a shareable/bookmarkable URL, and re-sorting happens in
 * the page's own JS sort over the already-fetched rows (see tasks/page.tsx),
 * not a client-side re-render of data already on the page. Clicking the
 * active column flips its direction; clicking a different column switches
 * to it ascending. */
export function SortableColumnHeader({
  label,
  field,
  activeField,
  activeDir,
  hrefFor,
  className = "",
}: {
  label: string;
  field: string;
  activeField: string;
  activeDir: "asc" | "desc";
  hrefFor: (field: string, dir: "asc" | "desc") => string;
  className?: string;
}) {
  const isActive = activeField === field;
  const nextDir: "asc" | "desc" = isActive && activeDir === "asc" ? "desc" : "asc";
  return (
    <Link
      href={hrefFor(field, nextDir)}
      className={`flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-slate-700 ${
        isActive ? "text-slate-700" : "text-slate-400"
      } ${className}`}
    >
      {label}
      <span className="w-2.5 text-[10px]" aria-hidden="true">
        {isActive ? (activeDir === "asc" ? "▲" : "▼") : ""}
      </span>
    </Link>
  );
}
