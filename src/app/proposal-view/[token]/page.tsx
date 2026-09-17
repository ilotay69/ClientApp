import type { Metadata } from "next";
import { getProposalByAccessToken } from "@/lib/proposal-data";
import { fetchBrochuresForProposal } from "@/lib/proposal-brochures";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/proposal-totals";
import { ProposalShell, ProposalMessage, ProposalWordmark } from "@/components/proposal-shell";
import { ProposalAcceptPanel } from "@/components/proposal-accept-panel";
import { ProposalViewBeacon } from "@/components/proposal-view-beacon";
import { acceptProposalByTokenAction, recordProposalViewAction } from "./actions";

export const dynamic = "force-dynamic";

// The URL itself is the credential here, so this page must never end up in
// a search index or a referrer header. next.config.ts sets X-Robots-Tag and
// Referrer-Policy for /proposal-view/*; this is the in-document half of the
// same instruction.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Public — no login of any kind, for the same reason the quarterly review
// acknowledgment page has none, only more so: the person reading this isn't
// a client yet and structurally cannot have an account (a clients row only
// ever comes from an active Autotask company, and portal logins require
// MFA). Asking a prospect to enrol in MFA before they can read your pricing
// is how you lose the deal.
//
// Note the route name: PUBLIC_PREFIX_PATHS in src/lib/supabase/middleware.ts
// matches with startsWith, so this MUST NOT be "/proposal" — that would also
// match "/proposals/<id>" and expose the entire staff section.
export default async function ProposalViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await getProposalByAccessToken(token);

  if (!proposal) {
    return (
      <ProposalMessage heading="This link isn't valid">
        <p>
          It may have been withdrawn or replaced. Please get in touch with your CG Technologies
          contact for an up-to-date copy.
        </p>
      </ProposalMessage>
    );
  }

  if (proposal.status === "draft") {
    return (
      <ProposalMessage heading="This proposal isn't ready yet">
        <p>Please check back once your CG Technologies contact has sent it through.</p>
      </ProposalMessage>
    );
  }

  if (proposal.status === "withdrawn" || proposal.status === "declined") {
    return (
      <ProposalMessage heading="This proposal is no longer available">
        <p>Please contact CG Technologies if you&apos;d like it reissued.</p>
      </ProposalMessage>
    );
  }

  if (proposal.acceptedAt) {
    return (
      <ProposalMessage heading="Already accepted">
        <p>
          {proposal.title} was accepted
          {proposal.acceptedByName ? ` by ${proposal.acceptedByName}` : ""} on{" "}
          {formatDate(proposal.acceptedAt)}.
        </p>
        {proposal.acceptedTotalAmount !== null && (
          <p>
            Agreed total {formatMoney(proposal.acceptedTotalAmount, proposal.currency)}, including
            HST.
          </p>
        )}
      </ProposalMessage>
    );
  }

  // Checked at read time and not left to the nightly cron — a proposal
  // shouldn't stay acceptable all day just because the sweep hasn't run.
  if (proposal.isExpired) {
    return (
      <ProposalMessage heading="This proposal has expired">
        <p>
          It was valid until {formatDate(proposal.validUntil)}. Your CG Technologies contact can
          send an updated copy.
        </p>
      </ProposalMessage>
    );
  }

  const brochures = await fetchBrochuresForProposal(proposal.id);
  const bodySections = proposal.sections.filter((s) => s.body?.trim() || s.kind === "pricing");
  // The accept panel normally renders inside the pricing section, where the
  // numbers are. If someone deleted that section, it falls to the bottom of
  // the page rather than disappearing — a proposal with no way to accept it
  // would defeat the entire feature.
  const hasPricingSection = bodySections.some((s) => s.kind === "pricing");
  const acceptPanel = (
    <ProposalAcceptPanel
      token={token}
      companyName={proposal.companyName}
      currency={proposal.currency}
      items={proposal.lineItems.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        billingPeriod: i.billingPeriod,
        isOptional: i.isOptional,
        isSelected: i.isSelected,
        detail: i.detail,
        listPrice: i.listPrice,
      }))}
      acceptAction={acceptProposalByTokenAction}
    />
  );

  return (
    <ProposalShell>
      <ProposalViewBeacon token={token} recordAction={recordProposalViewAction} />

      <header className="border-b border-slate-200 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <ProposalWordmark />
          {proposal.validUntil && (
            <span className="text-sm text-slate-400">
              Valid until {formatDate(proposal.validUntil)}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
          Proposal #{proposal.proposalNumber} for {proposal.companyName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {proposal.title}
        </h1>
        {proposal.intro && (
          <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-slate-600">
            {proposal.intro}
          </p>
        )}

        <div className="mt-12 space-y-12">
          {bodySections.map((section, index) => (
            <section key={section.id} id={`sec-${section.id}`} className="scroll-mt-6">
              <p className="text-sm font-semibold tabular-nums tracking-[0.2em] text-slate-400">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {section.heading}
              </h2>
              {section.body?.trim() && (
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-slate-700">
                  {section.body}
                </p>
              )}
              {section.kind === "pricing" && <div className="mt-6">{acceptPanel}</div>}
            </section>
          ))}

          {!hasPricingSection && acceptPanel}
        </div>

        {brochures.length > 0 && (
          <div className="mt-12 border-t border-slate-200 pt-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              More information
            </p>
            <ul className="mt-3 space-y-2">
              {brochures.map((b) => (
                <li key={b.id}>
                  <a
                    href={`/proposal-view/${token}/brochure/${b.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-base font-medium text-brand hover:underline"
                  >
                    {b.title}
                    <span aria-hidden="true" className="text-slate-400">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal.closingNote && (
          <p className="mt-12 whitespace-pre-line text-base leading-relaxed text-slate-600">
            {proposal.closingNote}
          </p>
        )}

        <p className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-400">
          For details of our full Master Service Agreement, and our terms and conditions, please
          visit{" "}
          <a
            href="https://cgtechnologies.com/master-service-agreement/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline"
          >
            cgtechnologies.com/master-service-agreement
          </a>
          .
        </p>

        <p className="mt-3 text-sm text-slate-400">
          Prepared by CG Technologies for {proposal.companyName}
          {proposal.contactName ? ` · ${proposal.contactName}` : ""}.
        </p>
      </main>
    </ProposalShell>
  );
}
