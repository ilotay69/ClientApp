/** A strip naming the environment, on every page, whenever
 * NEXT_PUBLIC_ENV_LABEL is set. Production leaves it unset and renders
 * nothing, so this costs production a single null check.
 *
 * It exists because staging and production are the same app against
 * different databases and will look identical down to the pixel — and the
 * mistake it guards against (thinking you are in staging while clicking
 * Send on a real proposal, or the reverse) is exactly the kind that is
 * only obvious afterwards.
 *
 * Rendered from the root layout rather than the dashboard layout so it
 * also covers the client portal and the unauthenticated proposal/QBR
 * token pages, which are the ones a client could be looking at. */
export function EnvBanner() {
  const label = process.env.NEXT_PUBLIC_ENV_LABEL?.trim();
  if (!label) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] flex h-[var(--env-banner-height)] shrink-0 items-center justify-center bg-amber-400 px-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-amber-950"
    >
      <span className="truncate">{label}</span>
    </div>
  );
}
