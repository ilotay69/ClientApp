import {
  fetchActiveContractBlocks,
  fetchContractsByIds,
  fetchTimeEntriesInRange,
  resolveResourceNames,
  type AutotaskContractBlock,
  type AutotaskCredentials,
} from "@/lib/autotask";

export type ContractBlockSummary = {
  startDate: string;
  endDate: string;
  hours: number;
};

export type ContractBlockHoursRow = {
  contractId: number;
  contractName: string;
  clientId: string | null;
  clientName: string;
  purchased: number;
  used: number;
  remaining: number;
  percentUsed: number;
  startDate: string;
  endDate: string;
  /** The individual currently-active blocks that sum to `purchased` — a
   * contract usually has just one, but a client whose replenishments were
   * never given their own narrow date range (each new block just spans
   * from its purchase date to some far-future/contract-end date, instead
   * of only its own billing period) can have several genuinely
   * "currently active" at once. Exposed so the UI can show that this
   * total is a sum, not one single purchase. */
  blocks: ContractBlockSummary[];
};

type ContractBlockGroup = {
  contractID: number;
  blocks: AutotaskContractBlock[];
  purchased: number;
  /** Earliest start / latest end across every block in the group — the
   * window billable usage is measured over below. For the normal case of
   * one active block per contract this is just that block's own range;
   * grouping only changes anything when more than one block is
   * simultaneously "active". */
  startDate: string;
  endDate: string;
};

/** Autotask's ContractBlocks carries no "hours used" field of its own, and
 * — critically — offers no reliable way to tell which specific block a
 * given TimeEntry was drawn against when more than one block for the same
 * contract is active at once (this MSP's Autotask data does exactly that:
 * a client can have several "Prepaid Hourly Bundle" blocks whose date
 * ranges all span today, each nominally 100 hours but overlapping by
 * years). Summing each block's billable TimeEntries independently — as an
 * earlier version of this file did — double- and triple-counts the same
 * entries once per overlapping block, wildly inflating "used" per block.
 * The only sound answer Autotask's own data supports is per-CONTRACT: add
 * up every currently-active block's hours as the purchased total, and
 * count each billable TimeEntry within the combined window exactly once. */
function groupBlocksByContract(blocks: AutotaskContractBlock[]): Map<number, ContractBlockGroup> {
  const groups = new Map<number, ContractBlockGroup>();
  for (const b of blocks) {
    const existing = groups.get(b.contractID);
    if (!existing) {
      groups.set(b.contractID, {
        contractID: b.contractID,
        blocks: [b],
        purchased: b.hours,
        startDate: b.startDate,
        endDate: b.endDate,
      });
    } else {
      existing.blocks.push(b);
      existing.purchased += b.hours;
      if (b.startDate < existing.startDate) existing.startDate = b.startDate;
      if (b.endDate > existing.endDate) existing.endDate = b.endDate;
    }
  }
  return groups;
}

/** Prepaid/block hours remaining per contract with at least one active
 * block, account-wide — purchased is the sum of every currently-active
 * block's hours, used is every billable TimeEntry in the combined window
 * counted once (see groupBlocksByContract for why not per-block). Sorted
 * so clients closest to running out surface first. */
export async function fetchContractBlockHours(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ContractBlockHoursRow[]> {
  const blocks = await fetchActiveContractBlocks(creds, zoneUrl);
  if (blocks.length === 0) return [];

  const groups = groupBlocksByContract(blocks);

  const contracts = await fetchContractsByIds(creds, zoneUrl, [...groups.keys()]);
  const contractById = new Map(contracts.map((c) => [c.id, c]));

  const companyIds = [...new Set(contracts.map((c) => c.companyID))];
  const { data: clients } = await admin
    .from("clients")
    .select("id, name, autotask_company_id")
    .in("autotask_company_id", companyIds.length > 0 ? companyIds : [-1]);
  const clientByCompanyId = new Map<number, { id: string; name: string }>(
    (clients ?? []).map(
      (c: { id: string; name: string; autotask_company_id: number }): [number, { id: string; name: string }] => [
        c.autotask_company_id,
        { id: c.id, name: c.name },
      ]
    )
  );

  // One fetch spanning the earliest group start through today covers every
  // group's own combined window — each group below filters back down to
  // its own startDate/endDate when summing.
  const groupList = [...groups.values()];
  const earliestStart = groupList.reduce((min, g) => (g.startDate < min ? g.startDate : min), groupList[0].startDate);
  const todayStr = new Date().toISOString().slice(0, 10);
  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, earliestStart, todayStr);

  const billableEntriesByContract = new Map<number, { day: string; hours: number }[]>();
  for (const e of entries) {
    if (e.contractID == null || e.isNonBillable) continue;
    const list = billableEntriesByContract.get(e.contractID) ?? [];
    list.push({ day: e.dateWorked.slice(0, 10), hours: e.hoursWorked });
    billableEntriesByContract.set(e.contractID, list);
  }

  const rows: ContractBlockHoursRow[] = groupList.map((g) => {
    const contract = contractById.get(g.contractID);
    const client = contract ? clientByCompanyId.get(contract.companyID) : undefined;
    const used = (billableEntriesByContract.get(g.contractID) ?? [])
      .filter((e) => e.day >= g.startDate && e.day <= g.endDate)
      .reduce((sum, e) => sum + e.hours, 0);
    const remaining = g.purchased - used;
    return {
      contractId: g.contractID,
      contractName: contract?.contractName ?? `Contract ${g.contractID}`,
      clientId: client?.id ?? null,
      clientName: client?.name ?? "Unknown client",
      purchased: g.purchased,
      used,
      remaining,
      percentUsed: g.purchased > 0 ? (used / g.purchased) * 100 : 0,
      startDate: g.startDate,
      endDate: g.endDate,
      blocks: g.blocks.map((b) => ({ startDate: b.startDate, endDate: b.endDate, hours: b.hours })),
    };
  });

  return rows.sort((a, b) => b.percentUsed - a.percentUsed);
}

export type ContractTimeEntryRow = {
  id: number;
  dateWorked: string;
  hoursWorked: number;
  resourceName: string | null;
  ticketId: number | null;
  taskId: number | null;
  summaryNotes: string | null;
  isNonBillable: boolean;
};

export type ContractUsageRow = ContractBlockHoursRow & {
  /** Every TimeEntry recorded in the contract's combined active-block
   * window, billable and non-billable both (only billable counts toward
   * `used`, above) — newest first, each entry counted once even when
   * several overlapping blocks cover it. For a per-client "what actually
   * happened against this contract" report, not just the summed total
   * fetchContractBlockHours gives. */
  entries: ContractTimeEntryRow[];
};

/** Same active-contract usage as fetchContractBlockHours, scoped to one
 * client (by Autotask company id) and carrying every individual TimeEntry
 * in the contract's combined window rather than just the summed total.
 * Kept as a separate function (not a flag on fetchContractBlockHours)
 * since that one is account-wide and resolving every resource name for
 * every entry across every client's contracts would be wasted work the
 * account-wide summary widget never needs. */
export async function fetchContractUsageForCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<ContractUsageRow[]> {
  const blocks = await fetchActiveContractBlocks(creds, zoneUrl);
  if (blocks.length === 0) return [];

  const allContracts = await fetchContractsByIds(
    creds,
    zoneUrl,
    blocks.map((b) => b.contractID)
  );
  const contractById = new Map(allContracts.filter((c) => c.companyID === companyId).map((c) => [c.id, c]));

  const relevantBlocks = blocks.filter((b) => contractById.has(b.contractID));
  if (relevantBlocks.length === 0) return [];

  const groups = groupBlocksByContract(relevantBlocks);
  const groupList = [...groups.values()];

  const { data: client } = await admin
    .from("clients")
    .select("id, name")
    .eq("autotask_company_id", companyId)
    .maybeSingle();

  // One fetch spanning the earliest group's start through today — each
  // group below filters back down to its own combined startDate/endDate.
  const earliestStart = groupList.reduce((min, g) => (g.startDate < min ? g.startDate : min), groupList[0].startDate);
  const todayStr = new Date().toISOString().slice(0, 10);
  const rawEntries = await fetchTimeEntriesInRange(creds, zoneUrl, earliestStart, todayStr);

  const entriesByContract = new Map<number, typeof rawEntries>();
  for (const e of rawEntries) {
    if (e.contractID == null || !contractById.has(e.contractID)) continue;
    const list = entriesByContract.get(e.contractID) ?? [];
    list.push(e);
    entriesByContract.set(e.contractID, list);
  }

  const resourceNames = await resolveResourceNames(
    creds,
    zoneUrl,
    rawEntries.map((e) => e.resourceID).filter((id): id is number => id != null)
  );

  return groupList
    .map((g) => {
      const contract = contractById.get(g.contractID)!;
      const entriesInRange = (entriesByContract.get(g.contractID) ?? []).filter(
        (e) => e.dateWorked.slice(0, 10) >= g.startDate && e.dateWorked.slice(0, 10) <= g.endDate
      );
      const used = entriesInRange.filter((e) => !e.isNonBillable).reduce((sum, e) => sum + e.hoursWorked, 0);
      const remaining = g.purchased - used;

      const row: ContractUsageRow = {
        contractId: g.contractID,
        contractName: contract.contractName,
        clientId: client?.id ?? null,
        clientName: client?.name ?? "Unknown client",
        purchased: g.purchased,
        used,
        remaining,
        percentUsed: g.purchased > 0 ? (used / g.purchased) * 100 : 0,
        startDate: g.startDate,
        endDate: g.endDate,
        blocks: g.blocks.map((b) => ({ startDate: b.startDate, endDate: b.endDate, hours: b.hours })),
        entries: entriesInRange
          .map((e) => ({
            id: e.id,
            dateWorked: e.dateWorked,
            hoursWorked: e.hoursWorked,
            resourceName: e.resourceID != null ? (resourceNames.get(e.resourceID) ?? null) : null,
            ticketId: e.ticketID,
            taskId: e.taskID,
            summaryNotes: e.summaryNotes,
            isNonBillable: e.isNonBillable,
          }))
          .sort((a, b) => (a.dateWorked < b.dateWorked ? 1 : -1)),
      };
      return row;
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);
}
