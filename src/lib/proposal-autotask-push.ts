// "Push to Autotask" — turns an accepted (or any) proposal in this app
// into a real Autotask Quote, since Autotask's REST API cannot create
// Invoices or BillingItems directly (both are read/update-only; the only
// way to generate an actual invoice is Autotask's own "Won Quote" wizard,
// a manual UI action). A Quote is the closest thing the API can create,
// and it's the point CG explicitly asked for — not an invoice.
//
// This writes real records to a live Autotask tenant (see the WRITE
// OPERATIONS section at the bottom of autotask.ts). Nothing here runs
// without a human confirming first — see previewAutotaskPush (read-only)
// vs executeAutotaskPush (the actual writes), and proposals/actions.ts's
// two-step action pair built on top of them.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

import {
  fetchAutotaskCatalog,
  searchAutotaskCompanies,
  createAutotaskCompany,
  createAutotaskQuoteLocation,
  createAutotaskOpportunity,
  createAutotaskQuote,
  createAutotaskQuoteItems,
  type AutotaskCatalogItem,
} from "@/lib/autotask";
import type { AutotaskSettings } from "@/lib/autotask-settings";
import { getProposal, type Proposal } from "@/lib/proposal-data";

export type AutotaskPushLineMatch = {
  lineItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  matchedCatalog: { kind: "service" | "product"; id: number; name: string } | null;
};

export type AutotaskPushPreview = {
  proposalTitle: string;
  companyName: string;
  /** Where companyName came from. A proposal can carry a linked client AND
   * a typed prospect name at once (see createProposalAction), and the
   * linked client wins — which is surprising enough when the two differ
   * that the dialog says so out loud rather than silently searching
   * Autotask for a name nobody typed. */
  companyNameSource: "client" | "prospect";
  /** Only set when the proposal carries a prospect company name that the
   * linked client's name is overriding. */
  overriddenProspectName: string | null;
  /** The proposal's own phone, if it has one. Creating a Company needs a
   * phone, so the dialog only has to ask when this is null. */
  prospectPhone: string | null;
  /** Set when this proposal's client is already linked to an Autotask
   * company — nothing to confirm, that company is simply used. */
  existingCompanyId: number | null;
  /** Only populated when existingCompanyId is null — name-search results
   * from Autotask a person should look through before deciding whether
   * one of these actually IS the prospect, or a brand new Company should
   * be created. */
  possibleCompanyMatches: { id: number; companyName: string }[];
  lines: AutotaskPushLineMatch[];
  unmatchedLineCount: number;
  fallbackServiceConfigured: boolean;
  /** Set if this proposal was already pushed - executing again would
   * otherwise create a duplicate Quote. */
  alreadyPushed: { quoteId: number; quoteNumber: string | null } | null;
};

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A usable Autotask company id, or null. Real ids are positive, but a
 * clients row can carry 0 from an earlier mapping that never resolved —
 * and 0 is falsy in one check and non-null in the next, which showed up as
 * the dialog claiming "already linked to company #0" while the push itself
 * had no company at all. Every read of autotask_company_id goes through
 * here so the two can't disagree. */
function linkedCompanyId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/** The one company name for this proposal, so the name the confirmation
 * dialog promises to create is always the name actually created. A
 * proposal is either against a real client or a free-text prospect; when
 * somehow both are set, the linked client's own name wins. */
function proposalCompanyName(proposal: Proposal): string | null {
  return proposal.clientName?.trim() || proposal.prospectCompany?.trim() || null;
}

/** yyyy-mm-dd in local time. toISOString() would be UTC, which after
 * ~8pm Eastern rolls a quote's effective date forward to tomorrow. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Autotask requires every QuoteItem to point at a real catalog record —
 * a matched Service/Product, or the configured fallback Service. Returns
 * null when a line can't be resolved at all, which has to be caught
 * before anything is written. */
function resolveLineReference(
  match: AutotaskCatalogItem | null,
  fallbackServiceId: number | null
): { serviceID?: number; productID?: number } | null {
  if (match?.kind === "service") return { serviceID: match.id };
  if (match?.kind === "product") return { productID: match.id };
  if (fallbackServiceId) return { serviceID: fallbackServiceId };
  return null;
}

function matchCatalogItem(catalog: AutotaskCatalogItem[], description: string): AutotaskCatalogItem | null {
  const needle = normalize(description);
  if (!needle) return null;
  // Exact match first (the common case when a line came from "Add from
  // Autotask" in the first place, or was typed to match a real service on
  // purpose); a contains-match second, so "Managed IT Services - Tier 2"
  // still finds a catalog item named "Managed IT Services".
  return (
    catalog.find((c) => normalize(c.name) === needle) ??
    catalog.find((c) => needle.includes(normalize(c.name)) || normalize(c.name).includes(needle)) ??
    null
  );
}

/** Read-only — resolves everything a confirmation dialog needs to show
 * without writing anything to Autotask or this app's own database. */
export async function previewAutotaskPush(
  admin: Admin,
  proposalId: string,
  autotaskSettings: AutotaskSettings
): Promise<AutotaskPushPreview | { error: string }> {
  const proposal = await getProposal(proposalId, admin);
  if (!proposal) return { error: "Proposal not found." };
  if (!autotaskSettings.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  const { credentials, zoneUrl } = autotaskSettings;

  let existingCompanyId: number | null = null;
  let possibleCompanyMatches: { id: number; companyName: string }[] = [];

  if (proposal.clientId) {
    const { data: client } = await admin
      .from("clients")
      .select("autotask_company_id")
      .eq("id", proposal.clientId)
      .maybeSingle();
    existingCompanyId = linkedCompanyId(client?.autotask_company_id);
  }

  if (!existingCompanyId) {
    const companyName = proposalCompanyName(proposal);
    if (companyName) {
      try {
        possibleCompanyMatches = await searchAutotaskCompanies(credentials, zoneUrl, companyName);
      } catch (err) {
        console.error("previewAutotaskPush: company search failed", err);
      }
    }
  }

  let catalog: AutotaskCatalogItem[] = [];
  try {
    catalog = await fetchAutotaskCatalog(credentials, zoneUrl);
  } catch (err) {
    console.error("previewAutotaskPush: catalog fetch failed", err);
  }

  const includedItems = proposal.lineItems.filter((i) => !i.isOptional || i.isSelected);
  const lines: AutotaskPushLineMatch[] = includedItems.map((item) => {
    const match = matchCatalogItem(catalog, item.description);
    return {
      lineItemId: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      matchedCatalog: match ? { kind: match.kind, id: match.id, name: match.name } : null,
    };
  });

  const resolvedName = proposalCompanyName(proposal);
  const usedClientName = Boolean(proposal.clientName?.trim());
  const prospectName = proposal.prospectCompany?.trim() || null;

  return {
    proposalTitle: proposal.title,
    companyName: resolvedName ?? "Unknown",
    companyNameSource: usedClientName ? "client" : "prospect",
    overriddenProspectName:
      usedClientName && prospectName && prospectName !== resolvedName ? prospectName : null,
    prospectPhone: proposal.prospectPhone?.trim() || null,
    existingCompanyId,
    possibleCompanyMatches,
    lines,
    unmatchedLineCount: lines.filter((l) => l.matchedCatalog === null).length,
    fallbackServiceConfigured: autotaskSettings.defaultQuoteServiceId != null,
    alreadyPushed: proposal.autotaskQuoteId
      ? { quoteId: proposal.autotaskQuoteId, quoteNumber: proposal.autotaskQuoteNumber }
      : null,
  };
}

export type AutotaskPushCompanyChoice =
  | { type: "use_existing"; companyId: number }
  /** phone because Autotask refuses to create a Company without one, and
   * a proposal carries no phone number of its own to fall back on. */
  | { type: "create_new"; phone: string };

/** The actual writes, in dependency order: Company (if needed) -> a
 * QuoteLocation for the address -> a scaffolding Opportunity -> the Quote
 * itself -> one QuoteItem per included line. Never called without a
 * confirmed companyChoice from the preview step — see
 * pushProposalToAutotaskAction in proposals/actions.ts. */
export async function executeAutotaskPush(
  admin: Admin,
  proposalId: string,
  autotaskSettings: AutotaskSettings,
  companyChoice: AutotaskPushCompanyChoice | null,
  requestedByUserId: string
): Promise<{ ok: true; quoteId: number } | { error: string }> {
  const proposal = await getProposal(proposalId, admin);
  if (!proposal) return { error: "Proposal not found." };
  // A finished push is done; an unfinished one (quote created, lines never
  // made it) resumes below on that same quote instead of creating a second.
  if (proposal.autotaskQuoteId && proposal.autotaskPushedAt) {
    return { ok: true, quoteId: proposal.autotaskQuoteId };
  }
  if (!autotaskSettings.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  const { credentials, zoneUrl } = autotaskSettings;

  try {
    // --- Everything that can fail, BEFORE anything is written -------------
    // Autotask has no transaction or rollback: a failure halfway through
    // leaves a real Company/Opportunity/Quote behind, and a retry would
    // then create a second set. So every check that can reject this push
    // runs first, against reads only.

    const includedItems = proposal.lineItems.filter((i) => !i.isOptional || i.isSelected);
    if (includedItems.length === 0) {
      return { error: "This proposal has no line items to push." };
    }

    // Deliberately not caught — if the catalog can't be read, every line
    // would silently fall back to the default service and the Quote in
    // Autotask would not be the one the preview showed.
    const catalog = await fetchAutotaskCatalog(credentials, zoneUrl);

    const resolvedLines: {
      item: (typeof includedItems)[number];
      reference: { serviceID?: number; productID?: number };
    }[] = [];
    for (const item of includedItems) {
      const reference = resolveLineReference(
        matchCatalogItem(catalog, item.description),
        autotaskSettings.defaultQuoteServiceId
      );
      if (!reference) {
        return {
          error: `"${item.description}" doesn't match an Autotask service and no fallback service is configured (Settings → Integrations → Autotask).`,
        };
      }
      resolvedLines.push({ item, reference });
    }

    // Resume: the Quote already exists from an attempt whose line items
    // never landed, so it just needs finishing. Everything below this
    // point creates records that would be duplicates.
    if (proposal.autotaskQuoteId) {
      // awaited, not just returned: inside an async function a returned
      // promise settles AFTER the try block is left, so a rejection would
      // sail straight past the catch below and surface as a raw server
      // error instead of a message naming what Autotask refused.
      return await addLinesAndFinish(
        admin,
        proposalId,
        proposal.autotaskQuoteId,
        resolvedLines,
        credentials,
        zoneUrl
      );
    }

    // --- Resource to own what gets created --------------------------------
    // Account manager on a newly created Company and owner of the
    // Opportunity, both of which Autotask requires. Must be a real
    // resource with CRM access, so an API-only user won't do.
    const ownerCandidateIds = [proposal.ownerId, requestedByUserId].filter(
      (id): id is string => Boolean(id)
    );
    let ownerResourceID: number | null = null;
    if (ownerCandidateIds.length > 0) {
      const { data: rows } = await admin
        .from("profiles")
        .select("id, autotask_resource_id")
        .in("id", ownerCandidateIds);
      for (const candidateId of ownerCandidateIds) {
        const row = (rows ?? []).find((r: { id: string }) => r.id === candidateId);
        if (row?.autotask_resource_id) {
          ownerResourceID = row.autotask_resource_id;
          break;
        }
      }
    }
    if (!ownerResourceID) {
      return {
        error:
          "Neither the proposal owner nor you have an Autotask resource linked (Settings → My Profile). Link one first.",
      };
    }

    // --- Resolve the Company ---------------------------------------------
    let companyId: number | null = null;
    // A linked client with an already-mapped Autotask company needs no
    // choice at all — that mapping is simply used. Anything else (a
    // prospect, or a linked client that was never mapped to Autotask)
    // falls through to whatever was confirmed in the preview dialog,
    // exactly like previewAutotaskPush's own resolution logic.
    let existingMappedCompanyId: number | null = null;
    if (proposal.clientId) {
      const { data: client } = await admin
        .from("clients")
        .select("autotask_company_id")
        .eq("id", proposal.clientId)
        .maybeSingle();
      existingMappedCompanyId = linkedCompanyId(client?.autotask_company_id);
    }

    if (existingMappedCompanyId) {
      companyId = existingMappedCompanyId;
    } else if (companyChoice?.type === "use_existing") {
      companyId = companyChoice.companyId;
    } else if (companyChoice?.type === "create_new") {
      const companyName = proposalCompanyName(proposal);
      if (!companyName) return { error: "This proposal has no company name to create in Autotask." };
      // The proposal's own phone is the real source; the dialog only asks
      // for one when the proposal predates that field or was left blank.
      const phone = proposal.prospectPhone?.trim() || companyChoice.phone.trim();
      if (!phone) {
        return { error: "Autotask needs a phone number to create a new company. Add one to this proposal first." };
      }
      companyId = await createAutotaskCompany(credentials, zoneUrl, {
        companyName,
        phone,
        ownerResourceID,
        address1: proposal.prospectAddress,
      });
    } else {
      return { error: "No company was chosen for this push." };
    }

    // --- Link a company this push CREATED back to CG Ops ------------------
    // Only ever for a company created here. Choosing an existing Autotask
    // company must not repoint the proposal at whatever local client
    // happens to carry it: proposals.client_id is not editable after
    // creation, so a wrong link is unfixable from the UI, and the proposal
    // would silently start presenting itself as a different company than
    // the prospect it was actually written for.
    if (companyChoice?.type === "create_new" && companyId) {
      if (proposal.clientId) {
        // Already knows who it is — this only fills in the mapping it was
        // missing, and never changes which client it points at.
        if (!existingMappedCompanyId) {
          await admin
            .from("clients")
            .update({ autotask_company_id: companyId })
            .eq("id", proposal.clientId);
        }
      } else {
        // Brand new Autotask company, so no existing client can carry it.
        const { data: newClient, error: clientError } = await admin
          .from("clients")
          .insert({
            name: proposalCompanyName(proposal) ?? "New client",
            autotask_company_id: companyId,
            primary_contact_name: proposal.prospectContactName,
            primary_contact_email: proposal.prospectEmail,
            address: proposal.prospectAddress,
          })
          .select("id")
          .single();
        // Non-fatal: the Autotask Quote is the point of this push, and a
        // missing local client row is fixable by hand afterward.
        if (clientError) console.error("executeAutotaskPush: creating local client failed", clientError);
        if (newClient) {
          await admin.from("proposals").update({ client_id: newClient.id }).eq("id", proposalId);
        }
      }
    }

    // --- QuoteLocation, Opportunity, Quote ----------------------------------
    const locationId = await createAutotaskQuoteLocation(credentials, zoneUrl, {
      address1: proposal.prospectAddress,
    });

    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    // An expired proposal would otherwise give the Opportunity a close
    // date before its own start date, which Autotask rejects.
    const validUntilDate = proposal.validUntil ? new Date(`${proposal.validUntil}T00:00:00`) : null;
    const closeDate = isoDate(validUntilDate && validUntilDate > today ? validUntilDate : in30Days);

    const opportunityId = await createAutotaskOpportunity(credentials, zoneUrl, {
      companyID: companyId,
      title: proposal.title,
      amount: proposal.totals.firstInvoiceTotal,
      ownerResourceID,
      startDate: isoDate(today),
      projectedCloseDate: closeDate,
    });

    const quoteId = await createAutotaskQuote(credentials, zoneUrl, {
      name: (proposal.quotationNumber
        ? `${proposal.quotationNumber} — ${proposal.title}`
        : proposal.title
      ).slice(0, 100),
      opportunityID: opportunityId,
      companyID: companyId,
      effectiveDate: isoDate(today),
      expirationDate: closeDate,
      locationID: locationId,
    });

    // The Quote exists in Autotask from here on, so record it before the
    // line items go in — a retry then resumes on this quote rather than
    // building a second Company/Opportunity/Quote. autotask_pushed_at is
    // deliberately NOT set yet: it is what marks the push finished, and a
    // quote with no lines on it is not finished.
    await admin.from("proposals").update({ autotask_quote_id: quoteId }).eq("id", proposalId);

    // awaited for the same reason as the resume path above.
    return await addLinesAndFinish(admin, proposalId, quoteId, resolvedLines, credentials, zoneUrl);
  } catch (err) {
    console.error("executeAutotaskPush failed", err);
    return { error: err instanceof Error ? err.message : "Failed to push this proposal to Autotask." };
  }
}

/** The last leg of a push: put the lines on the Quote, then mark the
 * proposal finished. Shared by a first attempt and by a resumed one, so
 * both agree on what "finished" means — autotask_pushed_at is written
 * only once every line is actually on the quote. */
async function addLinesAndFinish(
  admin: Admin,
  proposalId: string,
  quoteId: number,
  resolvedLines: {
    item: {
      quantity: number;
      unitPrice: number;
      description: string;
      detail: string | null;
      billingPeriod: "one_off" | "annual" | "monthly";
    };
    reference: { serviceID?: number; productID?: number };
  }[],
  credentials: AutotaskSettings["credentials"],
  zoneUrl: string
): Promise<{ ok: true; quoteId: number } | { error: string }> {
  await createAutotaskQuoteItems(
    credentials,
    zoneUrl,
    quoteId,
    resolvedLines.map(({ item, reference }) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      billingPeriod: item.billingPeriod,
      name: item.description,
      description: item.detail ? `${item.description} — ${item.detail}` : item.description,
      ...reference,
    }))
  );

  await admin
    .from("proposals")
    .update({ autotask_pushed_at: new Date().toISOString() })
    .eq("id", proposalId);

  return { ok: true, quoteId };
}

// Re-exported so callers only ever need this one module for the feature.
export type { Proposal };
