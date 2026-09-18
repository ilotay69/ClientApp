import { createAdminClient } from "@/lib/supabase/server";
import {
  computeProposalTotals,
  type ProposalBillingPeriod,
  type ProposalLineItemInput,
  type ProposalTotals,
} from "@/lib/proposal-totals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type ProposalStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired"
  | "withdrawn";

export type ProposalSection = {
  id: string;
  kind: string;
  heading: string;
  body: string | null;
  sortOrder: number;
};

export type ProposalLineItem = {
  id: string;
  description: string;
  detail: string | null;
  quantity: number;
  unitPrice: number;
  /** The pre-discount reference price, if the rep set one — never used in
   * any total, purely so a proposal can show "was $60, now $56.86" the
   * way the Autotask quote template's Unit Price / Adjusted Unit Price
   * columns do. Null means there's nothing to compare against. */
  listPrice: number | null;
  billingPeriod: ProposalBillingPeriod;
  isOptional: boolean;
  isSelected: boolean;
  sortOrder: number;
};

/** The full staff-side shape — everything, including the internal fields a
 * prospect must never see. */
export type Proposal = {
  id: string;
  /** Internal-only sequence (migration 132) — no longer shown anywhere;
   * quotationNumber below is the reference staff and clients actually see.
   * The access_token in the URL remains the only real credential; this is
   * never accepted as a lookup key anywhere. */
  proposalNumber: number;
  /** The client-facing reference ("BS-20260917-1432") — initials from the
   * company name plus the creation date/time, assigned once at creation
   * (migration 139). Null for a proposal created before that migration;
   * display code falls back to `#${proposalNumber}` in that case. */
  quotationNumber: string | null;
  clientId: string | null;
  clientName: string | null;
  prospectCompany: string | null;
  prospectContactName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  prospectAddress: string | null;
  title: string;
  status: ProposalStatus;
  currency: string;
  intro: string | null;
  closingNote: string | null;
  validUntil: string | null;
  /** Null means "use DEFAULT_PAYMENT_TERMS" (migration 143) — every render
   * site (editor, public page, PDF, email) falls back the same way. */
  paymentTerms: string | null;
  accessToken: string | null;
  ownerId: string | null;
  ownerName: string | null;
  /** The rep's own address — used as the reply-to and the "questions? get
   * hold of me" line, so a prospect replies to a person rather than to the
   * shared mailbox the send goes out from. */
  ownerEmail: string | null;
  createdById: string | null;
  createdByEmail: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedByEmail: string | null;
  acceptedVia: string | null;
  /** Staff-only tracking flag, separate from status — checked once
   * fulfillment/onboarding actually starts. Moves the proposal from the
   * "Accepted" tab to its own "Processing Internally" tab on the list
   * page; doesn't affect the client-facing side at all. See migration
   * 138 and setProposalProcessingInternallyAction. */
  processingInternally: boolean;
  /** What was actually agreed to, snapshotted at the moment of acceptance
   * — independent of whatever the line items say now. Null until
   * accepted. See acceptProposalByTokenAction / migration 131. */
  acceptedTotalAmount: number | null;
  acceptedTaxAmount: number | null;
  acceptedTaxRate: number | null;
  /** The real address, unlike proposal_views' hashed one — acceptance is
   * the record a dispute would turn on, so it's kept readable (migration
   * 133). Null for a staff-recorded (accepted_via='staff') acceptance,
   * which has no browser to capture. */
  acceptedIp: string | null;
  acceptedUserAgent: string | null;
  acceptAuthorityConfirmed: boolean;
  /** Storage path of the drawn signature captured at acceptance — pass to
   * getSignedProposalSignatureUrl to actually display it. Null for a
   * staff-recorded acceptance, or if the image upload failed. */
  acceptedSignaturePath: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  /** Set once "Push to Autotask" (147) actually creates a Quote — null
   * means this proposal has never been pushed. Guards against creating a
   * duplicate Quote if the button is clicked twice. */
  autotaskQuoteId: number | null;
  autotaskQuoteNumber: string | null;
  autotaskPushedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  totals: ProposalTotals;
};

export type ProposalListItem = {
  id: string;
  proposalNumber: number;
  quotationNumber: string | null;
  title: string;
  status: ProposalStatus;
  currency: string;
  recipientLabel: string;
  clientId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  validUntil: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  processingInternally: boolean;
  updatedAt: string;
  totals: ProposalTotals;
};

/** What the prospect's public page is allowed to know. Deliberately a
 * different type from Proposal rather than a subset picked at the render
 * site: created_by, sent_to_email, owner identity, the view log and the
 * access token itself must never reach a page served to someone holding
 * only a link, and a separate type makes leaking one a compile error
 * rather than an oversight. */
export type ProposalPublicView = {
  id: string;
  proposalNumber: number;
  quotationNumber: string | null;
  title: string;
  status: ProposalStatus;
  currency: string;
  companyName: string;
  contactName: string | null;
  address: string | null;
  /** The assigned rep's name only - never their email, which stays
   * internal even here. Shown next to CG's own name in the From/To block
   * so the prospect sees who they're actually dealing with. */
  ownerName: string | null;
  intro: string | null;
  closingNote: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  /** The permanent snapshot from the moment of acceptance, not a live
   * recompute — see migration 131. Null until accepted. */
  acceptedTotalAmount: number | null;
  sections: ProposalSection[];
  lineItems: ProposalLineItem[];
  /** Derived here rather than on the page so every caller agrees on what
   * "this link is no longer live" means. */
  isExpired: boolean;
};

const PROPOSAL_COLUMNS = `
  id, proposal_number, quotation_number, client_id, prospect_company, prospect_contact_name, prospect_email, prospect_phone,
  prospect_address, title, status, currency, intro, closing_note, valid_until, payment_terms, access_token,
  owner_id, created_by, sent_at, sent_to_email, first_viewed_at,
  last_viewed_at, view_count, accepted_at, accepted_by_name,
  accepted_by_email, accepted_via, accepted_total_amount, accepted_tax_amount,
  accepted_tax_rate, accepted_ip, accepted_user_agent,
  accept_authority_confirmed, accepted_signature_path, processing_internally,
  declined_at, decline_reason,
  reminder_count, last_reminder_at, autotask_quote_id, autotask_quote_number, autotask_pushed_at,
  created_at, updated_at
`;

function toLineItem(row: Record<string, unknown>): ProposalLineItem {
  return {
    id: row.id as string,
    description: (row.description as string) ?? "",
    detail: (row.detail as string) ?? null,
    // numeric(12,2) comes back from PostgREST as a string, not a number —
    // Number() here rather than at every call site, so the totals module
    // only ever sees real numbers.
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    listPrice: row.list_price !== null && row.list_price !== undefined ? Number(row.list_price) : null,
    billingPeriod: (row.billing_period as ProposalBillingPeriod) ?? "one_off",
    isOptional: Boolean(row.is_optional),
    isSelected: Boolean(row.is_selected),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function toSection(row: Record<string, unknown>): ProposalSection {
  return {
    id: row.id as string,
    kind: (row.kind as string) ?? "custom",
    heading: (row.heading as string) ?? "",
    body: (row.body as string) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function toTotalsInput(items: ProposalLineItem[]): ProposalLineItemInput[] {
  return items.map((i) => ({
    id: i.id,
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    billingPeriod: i.billingPeriod,
    isOptional: i.isOptional,
    isSelected: i.isSelected,
  }));
}

/** True when a proposal's own validity date has passed, regardless of
 * whether the nightly cron has got around to flipping its status yet. The
 * public page must not rely on the cron having run. */
export function isProposalExpired(
  status: ProposalStatus,
  validUntil: string | null
): boolean {
  if (status === "expired") return true;
  if (status === "accepted" || status === "draft") return false;
  if (!validUntil) return false;
  // valid_until is a date column: the proposal is good through the end of
  // that day, so compare dates and not timestamps.
  const today = new Date().toISOString().slice(0, 10);
  return validUntil < today;
}

/** What still has to be true before a proposal can go to a client.
 *
 * A pure function over an already-loaded proposal, so the editor's "Ready
 * to send" checklist and sendProposalAction's own guard run the exact same
 * rules — a Send button that's enabled while the server would refuse (or
 * vice versa) is its own bug.
 *
 * requireStoredEmail defaults true (the checklist card's use, and
 * sendProposalAction's own guard, which substitutes the about-to-be-sent
 * address into prospectEmail before calling this — so "stored" there
 * means "the one about to be saved"). Pass false for the Send panel's own
 * disabled-button check: the panel has no separate persisted email field
 * any more, only its own live "Email" input, which already independently
 * requires non-empty — checking the OLD stored value there too would
 * permanently block Send on a proposal that was created with no email set,
 * since nothing else ever writes prospect_email before a send succeeds. */
export function computeProposalBlockers(
  proposal: Proposal,
  opts?: { requireStoredEmail?: boolean }
): string[] {
  const requireStoredEmail = opts?.requireStoredEmail ?? true;
  const blockers: string[] = [];
  if (!proposal.title.trim()) blockers.push("Give the proposal a title.");
  if (requireStoredEmail && !proposal.prospectEmail?.trim()) {
    blockers.push("Add the recipient's email address.");
  }
  if (proposal.lineItems.filter((i) => !i.isOptional).length === 0) {
    blockers.push("Add at least one non-optional line item.");
  }
  if (proposal.sections.every((s) => !s.body?.trim())) {
    blockers.push("Write at least one section.");
  }
  if (!proposal.validUntil) blockers.push("Set a date the proposal is valid until.");
  return blockers;
}

export async function getProposal(
  id: string,
  admin: AdminClient = createAdminClient()
): Promise<Proposal | null> {
  const { data, error } = await admin
    .from("proposals")
    .select(
      `${PROPOSAL_COLUMNS}, clients(name), owner_profile:owner_id(full_name, email), created_by_profile:created_by(email)`
    )
    .eq("id", id)
    .maybeSingle();
  // Logged rather than swallowed: a missing column (a migration that never
  // ran) fails here exactly like a proposal that does not exist, and the
  // page it feeds then renders nothing with no clue why.
  if (error) console.error("getProposal: select failed", error);
  if (error || !data) return null;

  const [{ data: sectionRows }, { data: itemRows }] = await Promise.all([
    admin
      .from("proposal_sections")
      .select("id, kind, heading, body, sort_order")
      .eq("proposal_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("proposal_line_items")
      .select(
        "id, description, detail, quantity, unit_price, list_price, billing_period, is_optional, is_selected, sort_order"
      )
      .eq("proposal_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients;
  const owner = Array.isArray(data.owner_profile) ? data.owner_profile[0] : data.owner_profile;
  const createdByProfile = Array.isArray(data.created_by_profile)
    ? data.created_by_profile[0]
    : data.created_by_profile;
  const lineItems = (itemRows ?? []).map(toLineItem);

  return {
    id: data.id,
    proposalNumber: Number(data.proposal_number),
    quotationNumber: data.quotation_number ?? null,
    clientId: data.client_id ?? null,
    clientName: client?.name ?? null,
    prospectCompany: data.prospect_company ?? null,
    prospectContactName: data.prospect_contact_name ?? null,
    prospectEmail: data.prospect_email ?? null,
    prospectPhone: data.prospect_phone ?? null,
    prospectAddress: data.prospect_address ?? null,
    title: data.title,
    status: data.status as ProposalStatus,
    currency: data.currency ?? "CAD",
    intro: data.intro ?? null,
    closingNote: data.closing_note ?? null,
    validUntil: data.valid_until ?? null,
    paymentTerms: data.payment_terms ?? null,
    accessToken: data.access_token ?? null,
    ownerId: data.owner_id ?? null,
    ownerName: owner?.full_name ?? null,
    ownerEmail: owner?.email ?? null,
    createdById: data.created_by ?? null,
    createdByEmail: createdByProfile?.email ?? null,
    sentAt: data.sent_at ?? null,
    sentToEmail: data.sent_to_email ?? null,
    firstViewedAt: data.first_viewed_at ?? null,
    lastViewedAt: data.last_viewed_at ?? null,
    viewCount: data.view_count ?? 0,
    acceptedAt: data.accepted_at ?? null,
    acceptedByName: data.accepted_by_name ?? null,
    acceptedByEmail: data.accepted_by_email ?? null,
    acceptedVia: data.accepted_via ?? null,
    acceptedTotalAmount: data.accepted_total_amount !== null && data.accepted_total_amount !== undefined ? Number(data.accepted_total_amount) : null,
    acceptedTaxAmount: data.accepted_tax_amount !== null && data.accepted_tax_amount !== undefined ? Number(data.accepted_tax_amount) : null,
    acceptedTaxRate: data.accepted_tax_rate !== null && data.accepted_tax_rate !== undefined ? Number(data.accepted_tax_rate) : null,
    acceptedIp: data.accepted_ip ?? null,
    acceptedUserAgent: data.accepted_user_agent ?? null,
    acceptAuthorityConfirmed: Boolean(data.accept_authority_confirmed),
    acceptedSignaturePath: data.accepted_signature_path ?? null,
    processingInternally: Boolean(data.processing_internally),
    declinedAt: data.declined_at ?? null,
    declineReason: data.decline_reason ?? null,
    reminderCount: data.reminder_count ?? 0,
    lastReminderAt: data.last_reminder_at ?? null,
    autotaskQuoteId: data.autotask_quote_id ?? null,
    autotaskQuoteNumber: data.autotask_quote_number ?? null,
    autotaskPushedAt: data.autotask_pushed_at ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    sections: (sectionRows ?? []).map(toSection),
    lineItems,
    totals: computeProposalTotals(toTotalsInput(lineItems)),
  };
}

export type ProposalListFilters = {
  /** "open" folds draft+sent together — a proposal that's been opened but
   * not answered is still open, and "viewed" isn't a status (see 129). */
  bucket?: "open" | "accepted" | "closed";
  search?: string;
  /** A client id, or the literal "none" for proposals to brand-new
   * prospects that have no clients row at all. */
  clientId?: string;
};

const BUCKET_STATUSES: Record<string, ProposalStatus[]> = {
  open: ["draft", "sent"],
  accepted: ["accepted"],
  closed: ["declined", "expired", "withdrawn"],
};

export async function listProposals(
  filters: ProposalListFilters = {},
  admin: AdminClient = createAdminClient()
): Promise<ProposalListItem[]> {
  let query = admin
    .from("proposals")
    .select(
      `id, proposal_number, quotation_number, client_id, prospect_company, title, status, currency, valid_until,
       sent_at, first_viewed_at, last_viewed_at, view_count, accepted_at, processing_internally,
       updated_at, owner_id, clients(name), owner_profile:owner_id(full_name)`
    )
    .order("updated_at", { ascending: false });

  if (filters.bucket && BUCKET_STATUSES[filters.bucket]) {
    query = query.in("status", BUCKET_STATUSES[filters.bucket]);
  }
  if (filters.clientId === "none") {
    query = query.is("client_id", null);
  } else if (filters.clientId) {
    query = query.eq("client_id", filters.clientId);
  }
  if (filters.search) {
    // Escape the PostgREST or() separators so a comma or paren in the search
    // box can't break out of this filter expression.
    const safe = filters.search.replace(/[,()]/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,prospect_company.ilike.%${safe}%`);
  }

  const { data } = await query;
  if (!data) return [];

  // One query for every proposal's line items rather than one per row —
  // totals are shown on every list row, and N+1 here would be a query per
  // proposal on a page that's meant to be scanned.
  const ids = data.map((r: { id: string }) => r.id);
  const { data: itemRows } = ids.length
    ? await admin
        .from("proposal_line_items")
        .select("proposal_id, id, description, quantity, unit_price, list_price, billing_period, is_optional, is_selected, sort_order")
        .in("proposal_id", ids)
    : { data: [] };

  const itemsByProposal = new Map<string, ProposalLineItem[]>();
  for (const row of itemRows ?? []) {
    const list = itemsByProposal.get(row.proposal_id) ?? [];
    list.push(toLineItem(row));
    itemsByProposal.set(row.proposal_id, list);
  }

  return data.map((row: Record<string, unknown>) => {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const owner = Array.isArray(row.owner_profile) ? row.owner_profile[0] : row.owner_profile;
    const items = itemsByProposal.get(row.id as string) ?? [];
    return {
      id: row.id as string,
      proposalNumber: Number(row.proposal_number),
      quotationNumber: (row.quotation_number as string) ?? null,
      title: row.title as string,
      status: row.status as ProposalStatus,
      currency: (row.currency as string) ?? "CAD",
      recipientLabel:
        (client as { name?: string } | null)?.name ??
        (row.prospect_company as string) ??
        "Unknown",
      clientId: (row.client_id as string) ?? null,
      ownerId: (row.owner_id as string) ?? null,
      ownerName: (owner as { full_name?: string } | null)?.full_name ?? null,
      validUntil: (row.valid_until as string) ?? null,
      sentAt: (row.sent_at as string) ?? null,
      firstViewedAt: (row.first_viewed_at as string) ?? null,
      lastViewedAt: (row.last_viewed_at as string) ?? null,
      viewCount: (row.view_count as number) ?? 0,
      acceptedAt: (row.accepted_at as string) ?? null,
      processingInternally: Boolean(row.processing_internally),
      updatedAt: row.updated_at as string,
      totals: computeProposalTotals(toTotalsInput(items)),
    };
  });
}

/** Looked up by the random, unguessable access_token from the public link
 * (src/app/proposal-view) — never by proposal id, since that page has no
 * login at all and must not accept an arbitrary id straight from the URL.
 *
 * Returns the narrowed ProposalPublicView, so nothing internal can reach
 * the prospect's page even by accident. */
export async function getProposalByAccessToken(
  token: string,
  admin: AdminClient = createAdminClient()
): Promise<ProposalPublicView | null> {
  const { data, error } = await admin
    .from("proposals")
    .select(
      `id, proposal_number, quotation_number, title, status, currency, intro, closing_note, valid_until,
       payment_terms, accepted_at, accepted_by_name, accepted_total_amount, prospect_company,
       prospect_contact_name, prospect_address, clients(name), owner_profile:owner_id(full_name)`
    )
    .eq("access_token", token)
    .maybeSingle();
  if (error) console.error("getProposalByAccessToken: select failed", error);
  if (error || !data) return null;

  const [{ data: sectionRows }, { data: itemRows }] = await Promise.all([
    admin
      .from("proposal_sections")
      .select("id, kind, heading, body, sort_order")
      .eq("proposal_id", data.id)
      .order("sort_order", { ascending: true }),
    admin
      .from("proposal_line_items")
      .select(
        "id, description, detail, quantity, unit_price, list_price, billing_period, is_optional, is_selected, sort_order"
      )
      .eq("proposal_id", data.id)
      .order("sort_order", { ascending: true }),
  ]);

  const client = Array.isArray(data.clients) ? data.clients[0] : data.clients;
  const owner = Array.isArray(data.owner_profile) ? data.owner_profile[0] : data.owner_profile;
  const status = data.status as ProposalStatus;

  return {
    id: data.id,
    proposalNumber: Number(data.proposal_number),
    quotationNumber: data.quotation_number ?? null,
    title: data.title,
    status,
    currency: data.currency ?? "CAD",
    companyName: client?.name ?? data.prospect_company ?? "",
    contactName: data.prospect_contact_name ?? null,
    address: data.prospect_address ?? null,
    ownerName: owner?.full_name ?? null,
    intro: data.intro ?? null,
    closingNote: data.closing_note ?? null,
    validUntil: data.valid_until ?? null,
    paymentTerms: data.payment_terms ?? null,
    acceptedAt: data.accepted_at ?? null,
    acceptedByName: data.accepted_by_name ?? null,
    acceptedTotalAmount:
      data.accepted_total_amount !== null && data.accepted_total_amount !== undefined
        ? Number(data.accepted_total_amount)
        : null,
    sections: (sectionRows ?? []).map(toSection),
    lineItems: (itemRows ?? []).map(toLineItem),
    isExpired: isProposalExpired(status, data.valid_until ?? null),
  };
}
