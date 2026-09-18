import type { Metadata } from "next";
import { getProposalByAccessToken } from "@/lib/proposal-data";
import { fetchBrochuresForProposal } from "@/lib/proposal-brochures";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/proposal-totals";
import { ProposalShell, ProposalMessage, ProposalHeader } from "@/components/proposal-shell";
import { ProposalAcceptPanel } from "@/components/proposal-accept-panel";
import { ProposalViewBeacon } from "@/components/proposal-view-beacon";
import { acceptProposalByTokenAction, recordProposalViewAction } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getCompanyInfo } from "@/lib/company-info";

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

  // Recognizes a signed-in staff member opening their own tracked link
  // (e.g. from the "Preview" button in the editor, in the same browser)
  // so a draft can be checked before it's ever emailed, and so a rep
  // double-checking a link they already sent never inflates the "opened
  // X times" count that's meant to reflect the CLIENT's engagement. A
  // prospect never has this session cookie, so this can't be spoofed by
  // guessing at query params.
  const supabase = await createClient();
  const isStaffPreview = await hasPermission(supabase, "manage_proposals");

  if (proposal.status === "draft" && !isStaffPreview) {
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
    // Reached both moments after the accept button (if the page happens to
    // reload rather than swapping in place — see ProposalAcceptPanel) and
    // by anyone reopening the link long after. There's no way to tell those
    // two apart server-side, and a prospect rereading their own accepted
    // proposal wants the same reassurance either way, not a curt notice —
    // so this always reads as a thank-you, never "already".
    return (
      <ProposalMessage heading="Thank you for accepting!">
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
        <p>Our Sales Team will be in touch with you shortly for next steps.</p>
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

  const [brochures, companyInfo] = await Promise.all([
    fetchBrochuresForProposal(proposal.id),
    getCompanyInfo(),
  ]);
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
      paymentTerms={proposal.paymentTerms}
      acceptAction={acceptProposalByTokenAction}
    />
  );

  return (
    <ProposalShell>
      {/* Never mounted for a staff preview — this is what keeps a rep
          double-checking their own link, or opening it before sending,
          from ever counting as the client having opened it. */}
      {!isStaffPreview && <ProposalViewBeacon token={token} recordAction={recordProposalViewAction} />}

      {isStaffPreview && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-sm font-medium text-amber-800 sm:px-8">
          {proposal.status === "draft"
            ? "Staff preview — this hasn't been sent yet, and opening it doesn't count as a view."
            : "Staff preview — opening this link doesn't count as a client view."}
        </div>
      )}

      <ProposalHeader validUntilLabel={proposal.validUntil ? formatDate(proposal.validUntil) : null} />

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <p className="inline-flex items-center rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-brand-dark">
          Proposal {proposal.quotationNumber ?? `#${proposal.proposalNumber}`}
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {proposal.title}
        </h1>
        <p className="mt-2 text-lg text-slate-500">
          Prepared for <span className="font-semibold text-slate-700">{proposal.companyName}</span>
        </p>

        <div className="mt-8 grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-2">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-brand">From</p>
            <p className="mt-1.5 text-base font-semibold text-slate-900">{companyInfo.companyName}</p>
            {proposal.ownerName && <p className="text-sm text-slate-600">{proposal.ownerName}</p>}
            {companyInfo.address && (
              <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{companyInfo.address}</p>
            )}
          </div>
          <div className="border-t border-slate-200 bg-slate-50 p-5 sm:border-t-0 sm:border-l sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">To</p>
            <p className="mt-1.5 text-base font-semibold text-slate-900">{proposal.companyName}</p>
            {proposal.contactName && <p className="text-sm text-slate-600">{proposal.contactName}</p>}
            {proposal.address && (
              <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{proposal.address}</p>
            )}
          </div>
        </div>

        {proposal.intro && (
          <p className="mt-8 whitespace-pre-line text-lg leading-relaxed text-slate-600">
            {proposal.intro}
          </p>
        )}

        {/* The same credibility signals CG's own site leads with
            (cgtechnologies.com's "by the numbers" strip) — reinforcing trust
            right before a prospect reads pricing, not just on the marketing
            site they may never have visited. */}
        <div className="mt-10 overflow-hidden rounded-2xl bg-charcoal px-6 py-6 text-white sm:px-10">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-center">
            <TrustStat value="1996" label="Serving the GTA since" />
            <TrustDivider />
            <TrustStat value="95%" label="Client retention rate" />
            <TrustDivider />
            <TrustStat value="30 min" label="Average response time" />
          </div>
        </div>

        <div className="mt-12 space-y-12">
          {bodySections.map((section, index) => (
            <section key={section.id} id={`sec-${section.id}`} className="scroll-mt-6">
              <div className="flex items-center gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold tabular-nums text-brand-dark">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.heading}</h2>
              </div>
              {section.body?.trim() && (
                <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-slate-700">
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

        <div className="mt-12 space-y-3 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500 sm:p-8">
          <p>
            For details of our full Master Service Agreement, and our terms and conditions, please
            visit{" "}
            <a
              href="https://cgtechnologies.com/master-service-agreement/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand hover:underline"
            >
              cgtechnologies.com/master-service-agreement
            </a>
            .
          </p>
          <p>
            Prepared by CG Technologies for {proposal.companyName}
            {proposal.contactName ? ` · ${proposal.contactName}` : ""}.
          </p>
        </div>
      </main>
    </ProposalShell>
  );
}

function TrustStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-extrabold tabular-nums text-white sm:text-3xl">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wider text-white/60">{label}</p>
    </div>
  );
}

function TrustDivider() {
  return <div aria-hidden="true" className="hidden h-9 w-px bg-white/15 sm:block" />;
}
