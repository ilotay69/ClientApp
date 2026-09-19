/** The one "this isn't set up / isn't available" panel every portal
 * section uses, so an unlinked integration looks the same everywhere
 * instead of each page inventing its own empty state. */
export function PortalUnavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm text-slate-500">{children}</p>
    </div>
  );
}
