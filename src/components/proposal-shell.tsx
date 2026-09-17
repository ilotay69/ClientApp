/** The wrapper every prospect-facing proposal state shares — the live
 * document, and the invalid / expired / withdrawn / already-accepted
 * pages.
 *
 * They all use it so CG's branding never vanishes at exactly the moment
 * something has gone wrong, which is when a prospect is most likely to
 * wonder whether the link was legitimate in the first place.
 *
 * `proposal-type` restores Tailwind's stock type scale inside this subtree
 * (see globals.css) — the app's global scale is shrunk for dense ops
 * screens, which is the wrong size for a document someone reads on a phone
 * before deciding to spend money. */
export function ProposalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="proposal-type safe-top safe-bottom safe-x min-h-screen bg-white text-charcoal">
      {children}
    </div>
  );
}

export function ProposalWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`text-base font-semibold tracking-tight text-charcoal ${className}`}>
      <span className="text-brand">CG</span> Technologies
    </span>
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
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <ProposalWordmark className="mb-6" />
        <h1 className="text-2xl font-semibold text-slate-900">{heading}</h1>
        <div className="mt-3 space-y-2 text-base text-slate-600">{children}</div>
      </div>
    </ProposalShell>
  );
}
