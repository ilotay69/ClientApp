import {
  fetchActiveContractBlocks,
  fetchContractsByIds,
  fetchTimeEntriesInRange,
  resolveResourceNames,
  type AutotaskContractBlock,
  type AutotaskCredentials,
} from "@/lib/autotask";

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
};

/** Autotask's TimeEntries carry no field linking an entry to a specific
 * ContractBlock at all — only to the contract as a whole — so a Block is
 * the closest thing this data model offers to "which period is this hour
 * against". Normally exactly one block per contract has today within its
 * date range. But when replenishments are pre-provisioned ahead of time,
 * or an old block is never end-dated once superseded, several blocks for
 * the SAME contract can all satisfy "today falls in range" at once — this
 * MSP's own Autotask data does exactly that (Atlantic Coated Paper has 7
 * simultaneously "active" Prepaid Hourly Bundle blocks, one contract).
 * Autotask itself only shows one row for the contract there, so the right
 * read is "one active bundle", not seven — picking whichever block
 * started most recently (and still hasn't ended) is the best available
 * proxy for "the one actually in effect right now" given Autotask never
 * tells us which block a given hour was drawn against. */
function pickCurrentBlockPerContract(blocks: AutotaskContractBlock[]): Map<number, AutotaskContractBlock> {
  const current = new Map<number, AutotaskContractBlock>();
  for (const b of blocks) {
    const existing = current.get(b.contractID);
    if (!existing || b.startDate > existing.startDate) {
      current.set(b.contractID, b);
    }
  }
  return current;
}

/** Prepaid/block hours remaining per contract's single current block,
 * account-wide. Pulled straight from Autotask's own numbers, not
 * recomputed from TimeEntries — ContractBlocks.hoursApproved IS Autotask's
 * own running total of approved/billed hours against this exact block
 * (confirmed against its field reference), the same figure its own
 * Contract Block view labels "Hours Approved". Recomputing this from
 * TimeEntries independently (an earlier version of this file did) means
 * re-deriving Autotask's own billing/approval logic and inevitably
 * drifting from it — this just reads what Autotask already calculated.
 * Sorted so clients closest to running out surface first. */
export async function fetchContractBlockHours(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ContractBlockHoursRow[]> {
  const allBlocks = await fetchActiveContractBlocks(creds, zoneUrl);
  if (allBlocks.length === 0) return [];

  const currentBlocks = [...pickCurrentBlockPerContract(allBlocks).values()];

  const contracts = await fetchContractsByIds(
    creds,
    zoneUrl,
    currentBlocks.map((b) => b.contractID)
  );
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

  const rows: ContractBlockHoursRow[] = currentBlocks.map((b) => {
    const contract = contractById.get(b.contractID);
    const client = contract ? clientByCompanyId.get(contract.companyID) : undefined;
    const used = b.hoursApproved;
    const remaining = b.hours - used;
    return {
      contractId: b.contractID,
      contractName: contract?.contractName ?? `Contract ${b.contractID}`,
      clientId: client?.id ?? null,
      clientName: client?.name ?? "Unknown client",
      purchased: b.hours,
      used,
      remaining,
      percentUsed: b.hours > 0 ? (used / b.hours) * 100 : 0,
      startDate: b.startDate,
      endDate: b.endDate,
    };
  });

  return rows.sort((a, b) => b.percentUsed - a.percentUsed);
}

export type ContractTimeEntryRow = {
  id: number;
  dateWorked: string;
  /** Autotask's calculated billable hours (hoursToBill) — what actually
   * drew down the block, not necessarily what the tech logged as
   * hoursWorked (write-downs/rounding can differ). */
  hoursToBill: number;
  resourceName: string | null;
  ticketId: number | null;
  taskId: number | null;
  summaryNotes: string | null;
  isNonBillable: boolean;
  /** Whether this entry has cleared billing approval — see the note on
   * fetchContractBlockHours above for why unapproved entries don't count
   * toward `used` even though they're shown here. */
  isApproved: boolean;
};

export type ContractUsageRow = ContractBlockHoursRow & {
  /** Every TimeEntry recorded in the current block's own date range,
   * billable and non-billable both, approved and not — only billable AND
   * approved counts toward `used`, above. Newest first. For a per-client
   * "what actually happened against this block" report, not just the
   * summed total fetchContractBlockHours gives. */
  entries: ContractTimeEntryRow[];
};

/** Same current-block usage as fetchContractBlockHours (purchased/used/
 * remaining read straight from Autotask's own block.hours/hoursApproved,
 * not recomputed), scoped to one client and additionally carrying every
 * individual TimeEntry in that block's own window — for reference/audit
 * ("what actually happened"), not as the source of the used/remaining
 * numbers above them. Kept as a separate function (not a flag on
 * fetchContractBlockHours) since that one is account-wide and resolving
 * every resource name for every entry across every client's blocks would
 * be wasted work the account-wide summary widget never needs. */
export async function fetchContractUsageForCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string,
  companyId: number
): Promise<ContractUsageRow[]> {
  const allBlocks = await fetchActiveContractBlocks(creds, zoneUrl);
  if (allBlocks.length === 0) return [];

  const allContracts = await fetchContractsByIds(
    creds,
    zoneUrl,
    allBlocks.map((b) => b.contractID)
  );
  const contractById = new Map(allContracts.filter((c) => c.companyID === companyId).map((c) => [c.id, c]));

  const relevantBlocks = allBlocks.filter((b) => contractById.has(b.contractID));
  if (relevantBlocks.length === 0) return [];

  const currentBlocks = [...pickCurrentBlockPerContract(relevantBlocks).values()];

  const { data: client } = await admin
    .from("clients")
    .select("id, name")
    .eq("autotask_company_id", companyId)
    .maybeSingle();

  // One fetch spanning the earliest current block's start through today —
  // each block below filters back down to its own startDate/endDate. Only
  // feeds the entries list (reference/audit) — not the used/remaining
  // numbers, which come straight from each block's own hoursApproved.
  const earliestStart = currentBlocks.reduce((min, b) => (b.startDate < min ? b.startDate : min), currentBlocks[0].startDate);
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

  return currentBlocks
    .map((b) => {
      const contract = contractById.get(b.contractID)!;
      const entriesInRange = (entriesByContract.get(b.contractID) ?? []).filter(
        (e) => e.dateWorked.slice(0, 10) >= b.startDate && e.dateWorked.slice(0, 10) <= b.endDate
      );
      const used = b.hoursApproved;
      const remaining = b.hours - used;

      const row: ContractUsageRow = {
        contractId: b.contractID,
        contractName: contract.contractName,
        clientId: client?.id ?? null,
        clientName: client?.name ?? "Unknown client",
        purchased: b.hours,
        used,
        remaining,
        percentUsed: b.hours > 0 ? (used / b.hours) * 100 : 0,
        startDate: b.startDate,
        endDate: b.endDate,
        entries: entriesInRange
          .map((e) => ({
            id: e.id,
            dateWorked: e.dateWorked,
            hoursToBill: e.hoursToBill,
            resourceName: e.resourceID != null ? (resourceNames.get(e.resourceID) ?? null) : null,
            ticketId: e.ticketID,
            taskId: e.taskID,
            summaryNotes: e.summaryNotes,
            isNonBillable: e.isNonBillable,
            isApproved: e.isApproved,
          }))
          .sort((a, b) => (a.dateWorked < b.dateWorked ? 1 : -1)),
      };
      return row;
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);
}
