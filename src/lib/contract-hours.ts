import {
  fetchActiveContractBlocks,
  fetchContractsByIds,
  fetchTimeEntriesInRange,
  resolveResourceNames,
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

/** Prepaid/block hours remaining per active contract block. Autotask has no
 * "hours used" field on ContractBlocks itself (confirmed against its own
 * field reference) — consumption is computed by summing TimeEntries whose
 * contractID matches the block's contract, restricted to the block's own
 * active date range and to billable time only (isNonBillable time doesn't
 * draw down a prepaid block). Sorted so clients closest to running out
 * surface first. */
export async function fetchContractBlockHours(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<ContractBlockHoursRow[]> {
  const blocks = await fetchActiveContractBlocks(creds, zoneUrl);
  if (blocks.length === 0) return [];

  const contracts = await fetchContractsByIds(
    creds,
    zoneUrl,
    blocks.map((b) => b.contractID)
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

  // One fetch spanning the earliest block start through today covers every
  // block's own range — each block below filters back down to its own
  // startDate/endDate when summing.
  const earliestStart = blocks.reduce((min, b) => (b.startDate < min ? b.startDate : min), blocks[0].startDate);
  const todayStr = new Date().toISOString().slice(0, 10);
  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, earliestStart, todayStr);

  // Grouped by contract only here — narrowed to each block's own date range
  // below, since a contract can have multiple sequential blocks (e.g. one
  // purchased per renewal) and lumping them together would misattribute
  // hours worked under a later block to an earlier one or vice versa.
  const billableEntriesByContract = new Map<number, { day: string; hours: number }[]>();
  for (const e of entries) {
    if (e.contractID == null || e.isNonBillable) continue;
    const list = billableEntriesByContract.get(e.contractID) ?? [];
    list.push({ day: e.dateWorked.slice(0, 10), hours: e.hoursWorked });
    billableEntriesByContract.set(e.contractID, list);
  }

  const rows: ContractBlockHoursRow[] = blocks.map((b) => {
    const contract = contractById.get(b.contractID);
    const client = contract ? clientByCompanyId.get(contract.companyID) : undefined;
    const used = (billableEntriesByContract.get(b.contractID) ?? [])
      .filter((e) => e.day >= b.startDate && e.day <= b.endDate)
      .reduce((sum, e) => sum + e.hours, 0);
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
  hoursWorked: number;
  resourceName: string | null;
  ticketId: number | null;
  taskId: number | null;
  summaryNotes: string | null;
  isNonBillable: boolean;
};

export type ContractUsageRow = ContractBlockHoursRow & {
  /** Every TimeEntry recorded in this block's own date range, billable and
   * non-billable both (only billable counts toward `used`, above) — newest
   * first. For a per-client "what actually happened against this block"
   * report, not just the summed total fetchContractBlockHours gives. */
  entries: ContractTimeEntryRow[];
};

/** Same active-contract-block usage as fetchContractBlockHours, scoped to
 * one client (by Autotask company id) and carrying every individual
 * TimeEntry under each block rather than just the summed total. Kept as a
 * separate function (not a flag on fetchContractBlockHours) since that one
 * is account-wide and resolving every resource name for every entry across
 * every client's blocks would be wasted work the account-wide summary
 * widget never needs. */
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

  const { data: client } = await admin
    .from("clients")
    .select("id, name")
    .eq("autotask_company_id", companyId)
    .maybeSingle();

  // One fetch spanning the earliest relevant block's start through today —
  // each block below filters back down to its own startDate/endDate.
  const earliestStart = relevantBlocks.reduce((min, b) => (b.startDate < min ? b.startDate : min), relevantBlocks[0].startDate);
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

  return relevantBlocks
    .map((b) => {
      const contract = contractById.get(b.contractID)!;
      const entriesInRange = (entriesByContract.get(b.contractID) ?? []).filter(
        (e) => e.dateWorked.slice(0, 10) >= b.startDate && e.dateWorked.slice(0, 10) <= b.endDate
      );
      const used = entriesInRange.filter((e) => !e.isNonBillable).reduce((sum, e) => sum + e.hoursWorked, 0);
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
