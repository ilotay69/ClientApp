import { fetchWizerCustomers, fetchWizerMetrics, type WizerCredentials } from "@/lib/wizer";

export type WizerCompanyMetricsRow = {
  companyId: string;
  companyName: string;
  usersTotal: number;
  usersRegistered: number;
  trainingCompleted: number;
  trainingAssigned: number;
  trainingCompletedPct: number | null;
  phishingParticipated: number;
  phishingClicked: number;
  phishingClickedPct: number | null;
  phishingReported: number;
};

/** Security awareness training rollup, per company — the single
 * /reports/metrics call already covers training, gaming, and phishing
 * simulation, so this loops every customer company (there's no
 * account-wide "everyone" version of this endpoint) and derives the two
 * rates that actually matter for a "does this client need attention"
 * scan: how much assigned training is done, and what fraction of people
 * who got a phishing simulation clicked it. Sorted highest click rate
 * first — the real risk signal — with nulls (no phishing campaigns run
 * yet) last. */
export async function fetchWizerCompanyMetrics(creds: WizerCredentials): Promise<WizerCompanyMetricsRow[]> {
  const customers = await fetchWizerCustomers(creds);
  const rows: WizerCompanyMetricsRow[] = [];

  for (const c of customers) {
    const m = await fetchWizerMetrics(creds, c.companyId);
    rows.push({
      companyId: c.companyId,
      companyName: c.companyName,
      usersTotal: m.usersTotal,
      usersRegistered: m.usersRegistered,
      trainingCompleted: m.trainingCompleted,
      trainingAssigned: m.trainingAssigned,
      trainingCompletedPct: m.trainingAssigned > 0 ? (m.trainingCompleted / m.trainingAssigned) * 100 : null,
      phishingParticipated: m.phishingParticipated,
      phishingClicked: m.phishingClicked,
      phishingClickedPct: m.phishingParticipated > 0 ? (m.phishingClicked / m.phishingParticipated) * 100 : null,
      phishingReported: m.phishingReported,
    });
  }

  return rows.sort((a, b) => (b.phishingClickedPct ?? -1) - (a.phishingClickedPct ?? -1));
}
