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
  createAutotaskQuoteItem,
  type AutotaskCredentials,
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
    existingCompanyId = client?.autotask_company_id ?? null;
  }

  if (!existingCompanyId) {
    const companyName = proposal.clientName ?? proposal.prospectCompany ?? "";
    if (companyName.trim()) {
      try {
        possibleCompanyMatches = await searchAutotaskCompanies(credentials, zoneUrl, companyName.trim());
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

  return {
    proposalTitle: proposal.title,
    companyName: proposal.clientName ?? proposal.prospectCompany ?? "Unknown",
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
  | { type: "create_new" };

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
  if (proposal.autotaskQuoteId) {
    return { ok: true, quoteId: proposal.autotaskQuoteId };
  }
  if (!autotaskSettings.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }
  const { credentials, zoneUrl } = autotaskSettings;

  try {
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
      existingMappedCompanyId = client?.autotask_company_id ?? null;
    }

    if (existingMappedCompanyId) {
      companyId = existingMappedCompanyId;
    } else if (companyChoice?.type === "use_existing") {
      companyId = companyChoice.companyId;
    } else if (companyChoice?.type === "create_new") {
      const companyName = proposal.prospectCompany ?? proposal.clientName;
      if (!companyName) return { error: "This proposal has no company name to create in Autotask." };
      companyId = await createAutotaskCompany(credentials, zoneUrl, {
        companyName,
        address1: proposal.prospectAddress,
      });
    } else {
      return { error: "No company was chosen for this push." };
    }

    // --- Link the new Autotask company back to this app's own data --------
    // A proposal already pointing at a client just gets that client's
    // mapping filled in; a prospect gets promoted into a brand new client
    // row, linked via client_id from here on.
    let clientId = proposal.clientId;
    if (companyChoice?.type === "create_new" && companyId) {
      if (clientId) {
        await admin.from("clients").update({ autotask_company_id: companyId }).eq("id", clientId);
      } else {
        const { data: newClient, error: clientError } = await admin
          .from("clients")
          .insert({
            name: proposal.prospectCompany ?? proposal.clientName ?? "New client",
            autotask_company_id: companyId,
            primary_contact_name: proposal.prospectContactName,
            primary_contact_email: proposal.prospectEmail,
            address: proposal.prospectAddress,
          })
          .select("id")
          .single();
        if (clientError) {
          console.error("executeAutotaskPush: creating local client failed", clientError);
        } else if (newClient) {
          clientId = newClient.id;
          await admin.from("proposals").update({ client_id: clientId }).eq("id", proposalId);
        }
      }
    }

    // --- Resource to own the scaffolding Opportunity -----------------------
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

    // --- QuoteLocation, Opportunity, Quote ----------------------------------
    const locationId = await createAutotaskQuoteLocation(credentials, zoneUrl, {
      address1: proposal.prospectAddress,
    });

    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);

    const opportunityId = await createAutotaskOpportunity(credentials, zoneUrl, {
      companyID: companyId,
      title: proposal.title,
      amount: proposal.totals.firstInvoiceTotal,
      ownerResourceID,
      projectedCloseDate: isoDate(proposal.validUntil ? new Date(proposal.validUntil) : in30Days),
    });

    const quoteId = await createAutotaskQuote(credentials, zoneUrl, {
      name: `${proposal.quotationNumber ?? proposal.title} — ${proposal.title}`.slice(0, 100),
      opportunityID: opportunityId,
      effectiveDate: isoDate(today),
      expirationDate: isoDate(proposal.validUntil ? new Date(proposal.validUntil) : in30Days),
      locationID: locationId,
    });

    // --- Line items ----------------------------------------------------------
    let catalog: AutotaskCatalogItem[] = [];
    try {
      catalog = await fetchAutotaskCatalog(credentials, zoneUrl);
    } catch (err) {
      console.error("executeAutotaskPush: catalog fetch failed", err);
    }

    const includedItems = proposal.lineItems.filter((i) => !i.isOptional || i.isSelected);
    for (const item of includedItems) {
      const match = matchCatalogItem(catalog, item.description);
      const serviceID = match?.kind === "service" ? match.id : match ? undefined : autotaskSettings.defaultQuoteServiceId ?? undefined;
      const productID = match?.kind === "product" ? match.id : undefined;
      if (!serviceID && !productID) {
        return {
          error: `"${item.description}" doesn't match an Autotask service and no fallback service is configured (Settings → Integrations).`,
        };
      }
      await createAutotaskQuoteItem(credentials, zoneUrl, {
        quoteID: quoteId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        description: item.detail ? `${item.description} — ${item.detail}` : item.description,
        serviceID,
        productID,
      });
    }

    await admin
      .from("proposals")
      .update({ autotask_quote_id: quoteId, autotask_pushed_at: new Date().toISOString() })
      .eq("id", proposalId);

    return { ok: true, quoteId };
  } catch (err) {
    console.error("executeAutotaskPush failed", err);
    return { error: err instanceof Error ? err.message : "Failed to push this proposal to Autotask." };
  }
}

// Re-exported so callers only ever need this one module for the feature.
export type { Proposal };
