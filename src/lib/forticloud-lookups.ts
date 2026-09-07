import { fetchForticloudProducts, type ForticloudCredentials, type ForticloudProduct } from "@/lib/forticloud";

export type ForticloudSupportStatus = "expired" | "expiring_soon" | "active" | "unknown";

export type ForticloudDeviceRow = {
  accountLabel: string;
  serialNumber: string;
  productModel: string;
  description: string | null;
  supportEndDate: string | null;
  supportStatus: ForticloudSupportStatus;
  eosDate: string | null;
};

const EXPIRING_SOON_DAYS = 30;

/** Reduces a product's entitlements to the single soonest end date and a
 * status bucket — a device usually carries several entitlements
 * (FortiCare, FortiGuard bundles, etc.) and the one that matters for "is
 * this about to lapse" is whichever expires first, not any particular
 * entitlement type. */
function summarizeSupport(product: ForticloudProduct): { endDate: string | null; status: ForticloudSupportStatus } {
  const endDates = product.entitlements.map((e) => e.endDate).filter((d): d is string => Boolean(d));
  if (endDates.length === 0) return { endDate: null, status: "unknown" };

  const soonest = endDates.sort()[0];
  const daysLeft = (new Date(soonest).getTime() - Date.now()) / 86_400_000;
  const status: ForticloudSupportStatus = daysLeft < 0 ? "expired" : daysLeft <= EXPIRING_SOON_DAYS ? "expiring_soon" : "active";
  return { endDate: soonest, status };
}

const STATUS_RANK: Record<ForticloudSupportStatus, number> = {
  expired: 0,
  expiring_soon: 1,
  unknown: 2,
  active: 3,
};

/** One row per active (non-decommissioned) device across every FortiCloud
 * account on file — there's no MSP-partner umbrella for FortiCloud
 * (unlike Bitdefender/Huntress), so each account authenticates
 * independently and the caller passes in every account's own credentials
 * along with its label; this just fetches each, flattens, and sorts
 * worst-support-status first. */
export async function fetchForticloudDeviceInventory(
  accounts: { label: string; creds: ForticloudCredentials }[]
): Promise<ForticloudDeviceRow[]> {
  const rows: ForticloudDeviceRow[] = [];

  for (const account of accounts) {
    const products = await fetchForticloudProducts(account.creds);
    for (const p of products) {
      if (p.isDecommissioned) continue;
      const support = summarizeSupport(p);
      rows.push({
        accountLabel: account.label,
        serialNumber: p.serialNumber,
        productModel: p.productModel,
        description: p.description,
        supportEndDate: support.endDate,
        supportStatus: support.status,
        eosDate: p.productModelEoS,
      });
    }
  }

  return rows.sort(
    (a, b) => STATUS_RANK[a.supportStatus] - STATUS_RANK[b.supportStatus] || a.accountLabel.localeCompare(b.accountLabel)
  );
}
