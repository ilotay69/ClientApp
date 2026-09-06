import {
  fetchActiveContractBlocks,
  fetchContractsByIds,
  fetchTimeEntriesInRange,
  type AutotaskCredentials,
} from "@/lib/autotask";
import { buildWeeklyBuckets } from "@/lib/trend-buckets";
import type { WeeklyPoint } from "@/lib/client-hours-trend";

export type BlockOption = {
  blockId: number;
  contractId: number;
  clientId: string | null;
  clientName: string;
  contractName: string;
  purchased: number;
  startDate: string;
  endDate: string;
};

/** Every currently-active contract block, for a picker — same data
 * fetchContractBlockHours uses, without the usage computation, since the
 * caller here only needs it to populate a dropdown. */
export async function fetchActiveBlockOptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  creds: AutotaskCredentials,
  zoneUrl: string
): Promise<BlockOption[]> {
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

  return blocks
    .map((b) => {
      const contract = contractById.get(b.contractID);
      const client = contract ? clientByCompanyId.get(contract.companyID) : undefined;
      return {
        blockId: b.id,
        contractId: b.contractID,
        clientId: client?.id ?? null,
        clientName: client?.name ?? "Unknown client",
        contractName: contract?.contractName ?? `Contract ${b.contractID}`,
        purchased: b.hours,
        startDate: b.startDate,
        endDate: b.endDate,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

/** Cumulative billable hours used against one block's purchased hours,
 * bucketed weekly from the block's own start date through today (or its
 * end date, whichever is earlier) — the burn-down curve behind the single
 * current-snapshot number the Block Hours lookup shows. */
export async function fetchContractBurndown(
  creds: AutotaskCredentials,
  zoneUrl: string,
  block: Pick<BlockOption, "contractId" | "startDate" | "endDate">
): Promise<WeeklyPoint[]> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const rangeEnd = block.endDate < todayStr ? block.endDate : todayStr;
  if (block.startDate > rangeEnd) return [];

  const entries = await fetchTimeEntriesInRange(creds, zoneUrl, block.startDate, rangeEnd);
  const billable = entries.filter(
    (e) =>
      e.contractID === block.contractId &&
      !e.isNonBillable &&
      e.dateWorked.slice(0, 10) >= block.startDate &&
      e.dateWorked.slice(0, 10) <= rangeEnd
  );

  const buckets = buildWeeklyBuckets(new Date(block.startDate), new Date(rangeEnd));

  let cumulative = 0;
  return buckets.map((b) => {
    const weekHours = billable
      .filter((e) => e.dateWorked.slice(0, 10) >= b.start && e.dateWorked.slice(0, 10) <= b.end)
      .reduce((sum, e) => sum + e.hoursWorked, 0);
    cumulative += weekHours;
    return { label: b.label, value: cumulative };
  });
}
