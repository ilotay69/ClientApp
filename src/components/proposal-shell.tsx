/** The wrapper every prospect-facing proposal state shares — the live
 * document, and the invalid / expired / withdrawn / already-accepted
 * pages.
 *
 * They all use it so CG's branding never vanishes at exactly the moment
 * something has gone wrong, which is when a prospect is most likely to
 * wonder whether the link was legitimate in the first place — the top
 * brand bar lives here rather than per-page for the same reason.
 *
 * `proposal-type` restores Tailwind's stock type scale inside this subtree
 * (see globals.css) — the app's global scale is shrunk for dense ops
 * screens, which is the wrong size for a document someone reads on a phone
 * before deciding to spend money. */
export function ProposalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="proposal-type safe-top safe-bottom safe-x min-h-screen bg-white text-charcoal">
      <div aria-hidden="true" className="h-1.5 bg-gradient-to-r from-brand-dark via-brand to-brand-dark" />
      {children}
    </div>
  );
}

/** A simplified, faithful-in-spirit stand-in for CG's own circular mark
 * (cgtechnologies.com's header) — a solid badge rather than a traced
 * vector copy of their logo file, so it renders crisply at any size
 * without depending on an external asset. */
export function ProposalMark({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand text-white ring-2 ring-brand-soft"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      <span className="font-extrabold tracking-tighter">CG</span>
    </span>
  );
}

export function ProposalWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <ProposalMark />
      <span className="text-lg font-bold tracking-tight text-charcoal">
        <span className="text-brand">CG</span> Technologies
      </span>
    </span>
  );
}

/** The shared branded header bar — the live document and every non-live
 * state (invalid/expired/withdrawn/accepted) all use the exact same one,
 * so a prospect never sees a "stripped down" version of the page right
 * when something's gone sideways. `validUntilLabel` arrives pre-formatted
 * so this stays free of any date-formatting import. */
export function ProposalHeader({ validUntilLabel }: { validUntilLabel?: string | null }) {
  return (
    <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <ProposalWordmark />
        {validUntilLabel && (
          <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-dark">
            Valid until {validUntilLabel}
          </span>
        )}
      </div>
    </header>
  );
}

/** The centred single-message layout used by every non-live state. */
export function ProposalMessage({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <ProposalShell>
      <ProposalHeader />
      <div className="mx-auto flex max-w-md flex-col justify-center px-5 py-16 sm:py-24">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>
        <div className="mt-3 space-y-2 text-base text-slate-600">{children}</div>
      </div>
    </ProposalShell>
  );
}
