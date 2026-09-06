import {
  fetchActiveContractBlocks,
  fetchContractsByIds,
  fetchTimeEntriesInRange,
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
