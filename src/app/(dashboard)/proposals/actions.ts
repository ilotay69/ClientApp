"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permissions";
import { getProposal, computeProposalBlockers } from "@/lib/proposal-data";
import { formatProposalHeadline } from "@/lib/proposal-totals";
import { getEmailTemplate, applyTemplateVars } from "@/lib/email-templates";
import { buildProposalEmail, buildProposalAcceptedClientEmail } from "@/lib/resend";
import { sendMailAsSharedMailbox } from "@/lib/microsoft-graph";
import { getSharedMailboxSettings, getValidSharedMailboxToken } from "@/lib/shared-mailbox";
import { resolveAppUrl } from "@/lib/app-url";
import { formatDate } from "@/lib/format";
import { getAutotaskSettings } from "@/lib/autotask-settings";
import { fetchAutotaskCatalog, type AutotaskCatalogItem } from "@/lib/autotask";
import { getActiveAiSettings } from "@/lib/ai/settings";
import { generateProposalDraft, type ProposalDraft } from "@/lib/proposal-analysis";
import { setProposalBrochureLinks } from "@/lib/proposal-brochures";

export type ProposalActionState = { ok: boolean; message: string };
export type CreateProposalState = { error: string } | undefined;

const DENIED: ProposalActionState = {
  ok: false,
  message: "You don't have permission to do that.",
};

/** A proposal's content is only editable while it's a draft. Once it's been
 * sent, the prospect is looking at a URL that renders live from these rows
 * — editing them would silently change the document underneath someone
 * who's mid-read, and could change the price under someone about to accept.
 * reviseProposalAction is the deliberate way back to draft.
 *
 * Enforced here in every edit action rather than only by the UI hiding the
 * controls: a Server Action is its own POST endpoint, reachable regardless
 * of what the page chose to render. */
async function assertDraft(
  proposalId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  const { data } = await admin.from("proposals").select("status").eq("id", proposalId).maybeSingle();
  return data?.status === "draft";
}

function revalidateProposal(proposalId: string) {
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposalId}`);
}

/** The starting skeleton for a new proposal. Deliberately opinionated —
 * a rep staring at an empty page writes a worse proposal (and a slower
 * one) than a rep editing four headings that are already in the right
 * order. The pricing section is a positional marker for where the line-item
 * table renders; the items themselves hang off the proposal (see 129). */
const DEFAULT_SECTIONS = [
  {
    kind: "overview",
    heading: "Overview",
    body: "",
    sort_order: 0,
  },
  {
    kind: "steps",
    heading: "What we'll do",
    body: "",
    sort_order: 1,
  },
  {
    kind: "pricing",
    heading: "Quote Details",
    body: "",
    sort_order: 2,
  },
  {
    kind: "next_steps",
    heading: "Next steps",
    body: "",
    sort_order: 3,
  },
];

export async function createProposalAction(
  title: string,
  recipient: {
    clientId: string | null;
    company: string | null;
    contactName: string | null;
    email: string | null;
  }
): Promise<CreateProposalState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return { error: "You don't have permission to do that." };

  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { error: "Give the proposal a title." };

  const admin = createAdminClient();

  // Either an existing client or a named prospect company — the same check
  // the proposals_recipient_present constraint enforces, caught here so the
  // user gets a sentence instead of a Postgres error.
  const company = recipient.company?.trim() || null;
  if (!recipient.clientId && !company) {
    return { error: "Choose an existing client, or enter the prospect's company name." };
  }

  // For an existing client, snapshot their name into prospect_company too,
  // so an accepted proposal still says who it went to even if the client is
  // later renamed or unlinked.
  let snapshotCompany = company;
  if (recipient.clientId && !snapshotCompany) {
    const { data: client } = await admin
      .from("clients")
      .select("name")
      .eq("id", recipient.clientId)
      .maybeSingle();
    snapshotCompany = client?.name ?? null;
  }

  const { data, error } = await admin
    .from("proposals")
    .insert({
      client_id: recipient.clientId,
      prospect_company: snapshotCompany,
      prospect_contact_name: recipient.contactName?.trim() || null,
      prospect_email: recipient.email?.trim() || null,
      title: trimmedTitle,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createProposalAction: insert failed", error);
    return { error: "Could not create the proposal." };
  }

  const { error: sectionError } = await admin
    .from("proposal_sections")
    .insert(DEFAULT_SECTIONS.map((s) => ({ ...s, proposal_id: data.id })));
  if (sectionError) {
    console.error("createProposalAction: default sections failed", sectionError);
  }

  redirect(`/proposals/${data.id}`);
}

export async function updateProposalFieldAction(
  proposalId: string,
  field: string,
  value: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  // An allowlist, not the caller's string: this writes straight into an
  // update() and the field name arrives from the browser.
  const ALLOWED = new Set([
    "title",
    "intro",
    "closing_note",
    "valid_until",
    "currency",
    "prospect_company",
    "prospect_contact_name",
    "prospect_email",
  ]);
  if (!ALLOWED.has(field)) return;

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) return;

  const trimmed = value.trim();
  await admin
    .from("proposals")
    // A date column rejects "" — an emptied date field means "no expiry".
    .update({ [field]: trimmed === "" ? null : trimmed })
    .eq("id", proposalId);
  revalidateProposal(proposalId);
}

/** Re-checked here, not just left to the button being hidden once
 * accepted — an accepted proposal is a real agreement on record, and
 * Revise (reviseProposalAction) is the only sanctioned way to send an
 * updated round. A no-op delete (row still accepted) redirects back to
 * the proposal instead of the list, since nothing was actually deleted. */
export async function deleteProposalAction(proposalId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .delete()
    .eq("id", proposalId)
    .neq("status", "accepted")
    .select("id")
    .maybeSingle();

  if (!data) redirect(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  redirect("/proposals");
}

// ---------------------------------------------------------------- sections

export async function addProposalSectionAction(
  proposalId: string,
  heading: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) return;

  const { data: last } = await admin
    .from("proposal_sections")
    .select("sort_order")
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from("proposal_sections").insert({
    proposal_id: proposalId,
    kind: "custom",
    heading: heading.trim() || "New section",
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  revalidateProposal(proposalId);
}

export async function updateProposalSectionAction(
  sectionId: string,
  field: "heading" | "body",
  value: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;
  if (field !== "heading" && field !== "body") return;

  const admin = createAdminClient();
  const { data: section } = await admin
    .from("proposal_sections")
    .select("proposal_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return;
  if (!(await assertDraft(section.proposal_id, admin))) return;

  await admin
    .from("proposal_sections")
    .update({ [field]: field === "heading" ? value.trim() || "Untitled section" : value })
    .eq("id", sectionId);
  revalidateProposal(section.proposal_id);
}

export async function deleteProposalSectionAction(sectionId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: section } = await admin
    .from("proposal_sections")
    .select("proposal_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return;
  if (!(await assertDraft(section.proposal_id, admin))) return;

  await admin.from("proposal_sections").delete().eq("id", sectionId);
  revalidateProposal(section.proposal_id);
}

/** Up/down rather than drag-and-drop. No DnD library is in package.json,
 * and adding one to an 11-dependency app for one screen isn't the trade —
 * but the real reason is that HTML5 drag-and-drop does nothing at all on
 * touch, and repricing a proposal on an iPad between meetings is a case
 * this has to work for. Buttons are keyboard- and screen-reader-operable
 * for free.
 *
 * Swaps sort_order with the adjacent sibling instead of rewriting the whole
 * list, so two people reordering at once can't blank each other's work. */
export async function moveProposalSectionAction(
  sectionId: string,
  direction: "up" | "down"
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: section } = await admin
    .from("proposal_sections")
    .select("id, proposal_id, sort_order")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return;
  if (!(await assertDraft(section.proposal_id, admin))) return;

  // The nearest sibling in that direction: the largest sort_order below
  // this one going up, the smallest above it going down.
  const base = admin
    .from("proposal_sections")
    .select("id, sort_order")
    .eq("proposal_id", section.proposal_id);
  const { data: neighbour } =
    direction === "up"
      ? await base.lt("sort_order", section.sort_order).order("sort_order", { ascending: false }).limit(1).maybeSingle()
      : await base.gt("sort_order", section.sort_order).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  if (!neighbour) return;

  await Promise.all([
    admin.from("proposal_sections").update({ sort_order: neighbour.sort_order }).eq("id", section.id),
    admin.from("proposal_sections").update({ sort_order: section.sort_order }).eq("id", neighbour.id),
  ]);
  revalidateProposal(section.proposal_id);
}

// -------------------------------------------------------------- line items

export async function addProposalLineItemAction(proposalId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) return;

  const { data: last } = await admin
    .from("proposal_line_items")
    .select("sort_order")
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from("proposal_line_items").insert({
    proposal_id: proposalId,
    description: "New item",
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  revalidateProposal(proposalId);
}

/** The Autotask service/product catalog, for the line-item picker.
 *
 * Fetched on demand when the picker is opened rather than with the page:
 * it's two live Autotask queries plus a picklist lookup, and most edits to
 * a proposal never touch it. Same lazy posture as the other Autotask
 * panels in this app. */
export async function fetchAutotaskCatalogAction(): Promise<
  { items: AutotaskCatalogItem[] } | { error: string }
> {
  if (!(await requirePermission("manage_proposals"))) {
    return { error: "You don't have permission to do that." };
  }

  const admin = createAdminClient();
  const settings = await getAutotaskSettings(admin);
  if (!settings?.zoneUrl) {
    return { error: "Autotask isn't connected yet — set it up under Settings → Integrations." };
  }

  try {
    const items = await fetchAutotaskCatalog(settings.credentials, settings.zoneUrl);
    if (items.length === 0) {
      return { error: "Autotask returned no active services or products." };
    }
    return { items };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Couldn't load the catalog from Autotask.",
    };
  }
}

export type CatalogSelection = {
  name: string;
  detail: string | null;
  unitPrice: number;
  billingPeriod: "one_off" | "annual" | "monthly";
};

/** Adds the ticked catalog entries as line items.
 *
 * The chosen name/price/period come from the client rather than being
 * re-fetched from Autotask here. That's a deliberate call, not laziness:
 * the caller already holds manage_proposals, which lets them type any
 * price they like straight into the pricing table, so re-fetching would
 * buy no protection — only a second round of live Autotask queries on
 * every add. The values are still range-checked and length-capped below,
 * because "can't escalate privilege" isn't the same as "can write
 * anything into the database". */
export async function addProposalLineItemsFromCatalogAction(
  proposalId: string,
  selections: CatalogSelection[]
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, message: "Nothing selected." };
  }

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) {
    return { ok: false, message: "This proposal isn't a draft any more." };
  }

  const { data: last } = await admin
    .from("proposal_line_items")
    .select("sort_order")
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextOrder = (last?.sort_order ?? -1) + 1;
  const rows = selections.slice(0, 100).map((selection) => {
    const price = Number(selection.unitPrice);
    return {
      proposal_id: proposalId,
      description: (selection.name || "Untitled item").slice(0, 300),
      detail: selection.detail ? selection.detail.slice(0, 1000) : null,
      quantity: 1,
      unit_price: Number.isFinite(price) ? Math.max(0, price) : 0,
      // The catalog price at the moment it was added, kept as the
      // reference point even after unit_price is later discounted — so a
      // rep who negotiates the price down still shows "was $X" without
      // having to type the original figure back in.
      list_price: Number.isFinite(price) ? Math.max(0, price) : 0,
      billing_period:
        selection.billingPeriod === "monthly" || selection.billingPeriod === "annual"
          ? selection.billingPeriod
          : "one_off",
      sort_order: nextOrder++,
    };
  });

  const { error } = await admin.from("proposal_line_items").insert(rows);
  if (error) {
    console.error("addProposalLineItemsFromCatalogAction: insert failed", error);
    return { ok: false, message: "Couldn't add those items." };
  }

  revalidateProposal(proposalId);
  return {
    ok: true,
    message: `Added ${rows.length} item${rows.length === 1 ? "" : "s"}.`,
  };
}

export async function updateProposalLineItemAction(
  itemId: string,
  field: string,
  value: string
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("proposal_line_items")
    .select("proposal_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return;
  if (!(await assertDraft(item.proposal_id, admin))) return;

  // Each field is coerced to the shape its column actually holds, and the
  // numeric ones are clamped at zero — the check constraints in 129 would
  // reject a negative, and a rejected write from an inline editor is
  // invisible to whoever typed it.
  let patch: Record<string, unknown> | null = null;
  switch (field) {
    case "description":
      patch = { description: value.trim() || "Untitled item" };
      break;
    case "detail":
      patch = { detail: value.trim() || null };
      break;
    case "quantity":
    case "unit_price": {
      const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(parsed)) return;
      patch = { [field]: Math.max(0, parsed) };
      break;
    }
    case "list_price": {
      // Clearable, unlike unit_price/quantity: an empty field means "no
      // reference price to compare against", not zero.
      const trimmed = value.trim();
      if (trimmed === "") {
        patch = { list_price: null };
        break;
      }
      const parsed = Number(trimmed.replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(parsed)) return;
      patch = { list_price: Math.max(0, parsed) };
      break;
    }
    case "billing_period":
      if (value !== "one_off" && value !== "annual" && value !== "monthly") return;
      patch = { billing_period: value };
      break;
    case "is_optional": {
      // is_selected always resets: it's the prospect's own choice, only
      // meaningful while is_optional is true, and a stale "true" left on a
      // row that just stopped being optional would make the totals
      // module's included-item test ambiguous.
      patch = { is_optional: value === "true", is_selected: false };
      break;
    }
    default:
      return;
  }

  await admin.from("proposal_line_items").update(patch).eq("id", itemId);
  revalidateProposal(item.proposal_id);
}

export async function deleteProposalLineItemAction(itemId: string): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("proposal_line_items")
    .select("proposal_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return;
  if (!(await assertDraft(item.proposal_id, admin))) return;

  await admin.from("proposal_line_items").delete().eq("id", itemId);
  revalidateProposal(item.proposal_id);
}

// ---------------------------------------------------------------------- ai

export type ProposalDraftResult =
  | { draft: ProposalDraft; targets: { kind: string; heading: string; hasContent: boolean }[] }
  | { error: string };

/** Drafts the client-facing sections from the priced line items.
 *
 * Returns the draft for review — it deliberately writes nothing. The rep
 * decides what lands in the document, because this text goes in front of a
 * client with CG's name on it and an AI paragraph nobody read is a
 * liability, not a time-saver. applyProposalDraftAction does the writing. */
export async function generateProposalDraftAction(
  proposalId: string
): Promise<ProposalDraftResult> {
  const user = await requirePermission("manage_proposals");
  if (!user) return { error: "You don't have permission to do that." };

  const admin = createAdminClient();
  const proposal = await getProposal(proposalId, admin);
  if (!proposal) return { error: "Proposal not found." };
  if (proposal.status !== "draft") {
    return { error: "This proposal isn't a draft any more." };
  }
  if (proposal.lineItems.length === 0) {
    return { error: "Add the line items first — the draft is written from what you're quoting." };
  }

  const aiSettings = await getActiveAiSettings(admin);
  if (!aiSettings) {
    return { error: "No AI provider is configured — set one up under Settings → Integrations." };
  }

  try {
    const draft = await generateProposalDraft(
      proposal.clientName ?? proposal.prospectCompany ?? "the client",
      proposal.title,
      proposal.lineItems.map((item) => ({
        description: item.description,
        detail: item.detail,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        billingPeriod: item.billingPeriod,
        isOptional: item.isOptional,
      })),
      proposal.currency,
      aiSettings,
      proposal.intro
    );
    if (!draft) return { error: "The AI provider returned nothing usable. Try again." };

    return {
      draft,
      targets: proposal.sections.map((s) => ({
        kind: s.kind,
        heading: s.heading,
        hasContent: Boolean(s.body?.trim()),
      })),
    };
  } catch (err) {
    console.error("generateProposalDraftAction failed", err);
    return {
      error: err instanceof Error ? err.message : "Couldn't generate a draft.",
    };
  }
}

/** Which drafted field belongs in which section kind. "benefits" has no
 * default section — createProposalAction seeds Overview / What we'll do /
 * Investment / Next steps — so applying it creates one, positioned right
 * after the deployment section where it reads best. */
const DRAFT_FIELD_TO_SECTION_KIND: Record<string, string> = {
  overview: "overview",
  deploying: "steps",
  pricingNote: "pricing",
  nextSteps: "next_steps",
};

export async function applyProposalDraftAction(
  proposalId: string,
  field: string,
  text: string
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const body = text.trim();
  if (!body) return { ok: false, message: "Nothing to apply." };

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) {
    return { ok: false, message: "This proposal isn't a draft any more." };
  }

  if (field === "benefits") {
    const { data: existing } = await admin
      .from("proposal_sections")
      .select("id, sort_order, kind")
      .eq("proposal_id", proposalId)
      .order("sort_order", { ascending: true });

    const rows = (existing ?? []) as { id: string; sort_order: number; kind: string }[];
    const already = rows.find((s) => s.kind === "benefits");
    if (already) {
      await admin.from("proposal_sections").update({ body }).eq("id", already.id);
      revalidateProposal(proposalId);
      return { ok: true, message: "Benefits updated." };
    }

    // Slot it directly after the deployment section, shuffling everything
    // below down one so the new section doesn't collide on sort_order.
    const after = rows.find((s) => s.kind === "steps");
    const position = (after?.sort_order ?? rows.length - 1) + 1;
    for (const row of rows.filter((s) => s.sort_order >= position)) {
      await admin
        .from("proposal_sections")
        .update({ sort_order: row.sort_order + 1 })
        .eq("id", row.id);
    }
    await admin.from("proposal_sections").insert({
      proposal_id: proposalId,
      kind: "benefits",
      heading: "What this gives you",
      body,
      sort_order: position,
    });
    revalidateProposal(proposalId);
    return { ok: true, message: "Added a \"What this gives you\" section." };
  }

  const kind = DRAFT_FIELD_TO_SECTION_KIND[field];
  if (!kind) return { ok: false, message: "Unknown section." };

  const { data: section } = await admin
    .from("proposal_sections")
    .select("id, heading")
    .eq("proposal_id", proposalId)
    .eq("kind", kind)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!section) {
    return { ok: false, message: "That section has been deleted from this proposal." };
  }

  await admin.from("proposal_sections").update({ body }).eq("id", section.id);
  revalidateProposal(proposalId);
  return { ok: true, message: `${section.heading} updated.` };
}

// -------------------------------------------------------------- brochures

/** The full checked-set for one proposal, replacing whatever was checked
 * before — a checkbox-list form posts "what's checked right now", not an
 * incremental add/remove, so this is a straightforward replace rather than
 * a diff against the previous state. */
export async function setProposalBrochuresAction(
  proposalId: string,
  brochureIds: string[]
): Promise<void> {
  const user = await requirePermission("manage_proposals");
  if (!user) return;

  const admin = createAdminClient();
  if (!(await assertDraft(proposalId, admin))) return;

  await setProposalBrochureLinks(proposalId, Array.isArray(brochureIds) ? brochureIds : [], admin);
  revalidateProposal(proposalId);
}

// --------------------------------------------------------------- lifecycle

/** Sends the proposal, or re-sends it as a reminder.
 *
 * The access token is minted here on the first send and then kept for the
 * life of the proposal. Quarterly reviews rotate their token on every send,
 * because a corrected review must invalidate the old link — but a prospect
 * forwards a proposal link to their business partner or their accountant,
 * and rotating it would break it under them with no explanation.
 * revokeProposalLinkAction is the deliberate way to kill a link.
 *
 * toEmail (and ccEmail) may be a comma/semicolon-separated list —
 * sendMailAsSharedMailbox splits both into separate recipients. */
export async function sendProposalAction(
  proposalId: string,
  toEmail: string,
  ccEmail: string | null
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const trimmedEmail = toEmail.trim();
  if (!trimmedEmail) return { ok: false, message: "Enter an email address to send to." };
  const trimmedCc = ccEmail?.trim() || null;

  const admin = createAdminClient();
  const proposal = await getProposal(proposalId, admin);
  if (!proposal) return { ok: false, message: "Proposal not found." };

  const isResend = proposal.status === "sent";
  if (proposal.status !== "draft" && !isResend) {
    return { ok: false, message: "This proposal isn't in a state that can be sent." };
  }

  // The same checks the editor's "Ready to send" list shows, run again here
  // — the button being enabled is not the authority on whether this is
  // sendable.
  const blockers = computeProposalBlockers({ ...proposal, prospectEmail: trimmedEmail });
  if (blockers.length > 0) {
    return { ok: false, message: blockers[0]! };
  }

  const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
  if (!mailboxEmail) return { ok: false, message: "The shared mailbox isn't configured." };
  const settings = await getSharedMailboxSettings(admin);
  if (!settings) return { ok: false, message: "The shared mailbox integration isn't set up yet." };

  const accessToken = proposal.accessToken ?? crypto.randomUUID();
  const viewUrl = `${resolveAppUrl()}/proposal-view/${accessToken}`;

  try {
    const graphToken = await getValidSharedMailboxToken(admin, settings);
    const template = await getEmailTemplate(admin, "proposal");
    const templateVars = {
      recipient_name: proposal.prospectContactName ?? "",
      company_name: proposal.clientName ?? proposal.prospectCompany ?? "",
      proposal_title: proposal.title,
      valid_until: formatDate(proposal.validUntil),
    };

    const { html, text } = buildProposalEmail(
      proposal.prospectContactName,
      proposal.clientName ?? proposal.prospectCompany ?? "",
      proposal.title,
      formatProposalHeadline(proposal.totals, proposal.currency),
      viewUrl,
      proposal.validUntil ? formatDate(proposal.validUntil) : null,
      applyTemplateVars(template.intro, templateVars),
      applyTemplateVars(template.note, templateVars),
      isResend ? `Reminder ${proposal.reminderCount + 1}` : null
    );

    // Brochures show as a link on the prospect's own page (fetched at
    // render time from fetchBrochuresForProposal there) but deliberately
    // aren't attached here — the email stays a short nudge toward the
    // tracked link, not a bundle of files someone can read without ever
    // clicking through.
    await sendMailAsSharedMailbox(graphToken, mailboxEmail, {
      to: trimmedEmail,
      cc: trimmedCc,
      subject: applyTemplateVars(template.subject, templateVars),
      html,
      text,
    });
  } catch (err) {
    console.error("sendProposalAction: send failed", err);
    return { ok: false, message: "Sending failed — check the shared mailbox settings." };
  }

  await admin
    .from("proposals")
    .update(
      isResend
        ? {
            reminder_count: proposal.reminderCount + 1,
            last_reminder_at: new Date().toISOString(),
            sent_to_email: trimmedEmail,
          }
        : {
            status: "sent",
            sent_at: new Date().toISOString(),
            sent_to_email: trimmedEmail,
            prospect_email: trimmedEmail,
            access_token: accessToken,
          }
    )
    .eq("id", proposalId);

  revalidateProposal(proposalId);
  return {
    ok: true,
    message: isResend ? `Reminder sent to ${trimmedEmail}.` : `Sent to ${trimmedEmail}.`,
  };
}

/** Mints (or returns the existing) access token so staff can open and read
 * the exact page a client will see before ever sending an email — without
 * this, a draft has no token yet, since sendProposalAction only mints one
 * at send time. Deliberately does NOT touch status/sent_at: previewing a
 * draft must not turn it into a "sent" proposal. The public page itself
 * (proposal-view/[token]/page.tsx) recognizes a signed-in staff viewer and
 * renders a draft normally instead of the "not ready yet" placeholder, and
 * skips the view-tracking beacon so a preview never inflates the "opened
 * X times" signal a rep relies on. */
export async function getProposalPreviewLinkAction(
  proposalId: string
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const user = await requirePermission("manage_proposals");
  if (!user) return { ok: false, message: "You don't have permission to do that." };

  const admin = createAdminClient();
  const proposal = await getProposal(proposalId, admin);
  if (!proposal) return { ok: false, message: "Proposal not found." };

  let token = proposal.accessToken;
  if (!token) {
    token = crypto.randomUUID();
    const { error } = await admin.from("proposals").update({ access_token: token }).eq("id", proposalId);
    if (error) return { ok: false, message: error.message };
  }

  return { ok: true, url: `${resolveAppUrl()}/proposal-view/${token}` };
}

/** Records an acceptance that happened off-platform — the prospect said yes
 * on a call. Guarded on accepted_at still being null so it can't overwrite
 * a real link acceptance that landed first. */
export async function markProposalAcceptedByStaffAction(
  proposalId: string,
  acceptedByName: string
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const name = acceptedByName.trim();
  if (!name) return { ok: false, message: "Enter who accepted it." };

  const admin = createAdminClient();
  const proposal = await getProposal(proposalId, admin);
  if (!proposal) return { ok: false, message: "Proposal not found." };

  const { data, error } = await admin
    .from("proposals")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_name: name,
      accepted_via: "staff",
      accepted_recorded_by: user.id,
      // A snapshot of what was agreed to, same as the link-acceptance path
      // — the totals module's numbers, not a live re-read later. There's
      // no per-item authority checkbox for a phone call, but a staff
      // member recording it is themselves vouching for it, which is what
      // this column exists to capture.
      accepted_total_amount: proposal.totals.firstInvoiceTotal,
      accepted_tax_amount: proposal.totals.taxAmount,
      accepted_tax_rate: proposal.totals.taxRate,
      accept_authority_confirmed: true,
    })
    .eq("id", proposalId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("markProposalAcceptedByStaffAction failed", error);
    return { ok: false, message: "Could not record that." };
  }
  if (!data) return { ok: false, message: "This proposal has already been accepted." };

  // Same itemized client confirmation as an online acceptance — a phone
  // acceptance shouldn't be the one path that leaves the client with
  // nothing in writing. Best-effort: recording the acceptance itself must
  // succeed regardless of whether this courtesy email does.
  const recipientEmail = proposal.prospectEmail ?? proposal.sentToEmail;
  if (recipientEmail) {
    try {
      const mailboxEmail = process.env.SHARED_MAILBOX_EMAIL;
      const settings = mailboxEmail ? await getSharedMailboxSettings(admin) : null;
      if (mailboxEmail && settings) {
        const graphToken = await getValidSharedMailboxToken(admin, settings);
        const template = await getEmailTemplate(admin, "proposal_accepted");
        const companyName = proposal.clientName ?? proposal.prospectCompany ?? "";
        const templateVars = {
          recipient_name: name,
          company_name: companyName,
          proposal_title: proposal.title,
        };
        const includedItems = proposal.lineItems
          .filter((i) => !i.isOptional || i.isSelected)
          .map((i) => ({
            description: i.description,
            detail: i.detail,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            billingPeriod: i.billingPeriod,
          }));
        const { html, text } = buildProposalAcceptedClientEmail(
          proposal.prospectContactName ?? name,
          companyName,
          proposal.title,
          includedItems,
          proposal.totals,
          proposal.currency,
          applyTemplateVars(template.intro, templateVars),
          applyTemplateVars(template.note, templateVars)
        );
        await sendMailAsSharedMailbox(graphToken, mailboxEmail, {
          to: recipientEmail,
          subject: applyTemplateVars(template.subject, templateVars),
          html,
          text,
        });
      }
    } catch (err) {
      console.error("markProposalAcceptedByStaffAction: client confirmation email failed", err);
    }
  }

  revalidateProposal(proposalId);
  return { ok: true, message: `Recorded as accepted by ${name}.` };
}

export async function declineProposalAction(
  proposalId: string,
  reason: string
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      decline_reason: reason.trim() || null,
    })
    .eq("id", proposalId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, message: "This proposal has already been accepted." };
  revalidateProposal(proposalId);
  return { ok: true, message: "Marked as declined." };
}

export async function withdrawProposalAction(proposalId: string): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .update({ status: "withdrawn" })
    .eq("id", proposalId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, message: "This proposal has already been accepted." };
  revalidateProposal(proposalId);
  return { ok: true, message: "Withdrawn. The link now shows as no longer available." };
}

/** Back to draft so it can be edited and re-sent. The access token is
 * deliberately kept: the prospect may already have forwarded that link
 * internally, and they should land on the corrected version rather than a
 * dead page. Use revokeProposalLinkAction when the old link genuinely
 * needs to stop working.
 *
 * Reviving an already-ACCEPTED proposal additionally resets its entire
 * sent/viewed/accepted history (see the full field list below) so the
 * next send starts clean instead of still looking like the old,
 * already-agreed-to round - the UI reconfirms this specific case before
 * calling in, since it's the one destructive path here. Reopening a
 * declined/withdrawn/expired proposal (which never had an acceptance to
 * begin with) just flips status back to draft and leaves its prior
 * sent/view history alone.
 *
 * prospect_email/company/contact name, title, sections, and line items
 * are never touched either way - those are the proposal's actual
 * content, not history, and staff shouldn't have to retype them just to
 * send an updated round. */
export async function reviseProposalAction(proposalId: string): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("proposals")
    .select("status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!current) return { ok: false, message: "Proposal not found." };

  const wasAccepted = current.status === "accepted";
  const { data } = await admin
    .from("proposals")
    .update(
      wasAccepted
        ? {
            status: "draft",
            sent_at: null,
            sent_to_email: null,
            first_viewed_at: null,
            last_viewed_at: null,
            view_count: 0,
            reminder_count: 0,
            last_reminder_at: null,
            accepted_at: null,
            accepted_by_name: null,
            accepted_by_email: null,
            accepted_via: null,
            accepted_total_amount: null,
            accepted_tax_amount: null,
            accepted_tax_rate: null,
            accepted_ip: null,
            accepted_user_agent: null,
            accept_authority_confirmed: false,
            accepted_signature_path: null,
            processing_internally: false,
          }
        : { status: "draft" }
    )
    .eq("id", proposalId)
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, message: "Proposal not found." };
  revalidateProposal(proposalId);
  return {
    ok: true,
    message: wasAccepted
      ? "Back to draft, with sending and view history reset - ready to send fresh."
      : "Back to draft. The existing link will show the revised version once you send again.",
  };
}

export async function revokeProposalLinkAction(proposalId: string): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  await admin.from("proposals").update({ access_token: null }).eq("id", proposalId);
  revalidateProposal(proposalId);
  return { ok: true, message: "Link revoked. Anyone who opens it now sees an invalid-link page." };
}

/** Staff-only tracking, independent of the client-facing status — checked
 * once fulfillment/onboarding actually starts on an accepted proposal.
 * Guarded on status = 'accepted' since that's the only state the
 * Processing Internally tab (and the checkbox itself) ever applies to. */
export async function setProposalProcessingInternallyAction(
  proposalId: string,
  checked: boolean
): Promise<ProposalActionState> {
  const user = await requirePermission("manage_proposals");
  if (!user) return DENIED;

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .update({ processing_internally: checked })
    .eq("id", proposalId)
    .eq("status", "accepted")
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, message: "Only an accepted proposal can be marked as processing." };
  revalidateProposal(proposalId);
  return { ok: true, message: checked ? "Marked as processing internally." : "Unmarked." };
}

/** The raw open log behind the "opened 4 times" pill — loaded on demand
 * rather than with the page, since it's only ever looked at when someone is
 * specifically arguing about whether a proposal was received. */
export async function fetchProposalViewsAction(
  proposalId: string
): Promise<{ viewedAt: string; isBot: boolean; userAgent: string | null }[]> {
  const user = await requirePermission("view_proposals");
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("proposal_views")
    .select("viewed_at, is_bot, user_agent")
    .eq("proposal_id", proposalId)
    .order("viewed_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((r: { viewed_at: string; is_bot: boolean; user_agent: string | null }) => ({
    viewedAt: r.viewed_at,
    isBot: r.is_bot,
    userAgent: r.user_agent,
  }));
}
