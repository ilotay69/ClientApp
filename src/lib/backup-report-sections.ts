// The daily backup checklist's fixed section list — mirrors the spreadsheet
// this replaces exactly (same sections, same instructions, same "Result"
// label per section). Pure data, no imports — safe to use from both server
// code (the AI analysis prompt, the emailed report) and client components
// (the checklist form).

export type BackupReportSection = {
  key: string;
  label: string;
  /** The instructions shown above the field, straight from the original
   * checklist — what staff are meant to actually go check. */
  instructions: string;
  /** What a normal, no-issue result is called for this section in the
   * original sheet ("Checked" vs "Success") — cosmetic only, both map to
   * the same "ok" status value underneath. */
  okLabel: "Checked" | "Success";
};

export const BACKUP_REPORT_SECTIONS: BackupReportSection[] = [
  {
    key: "prtg",
    label: "PRTG Status",
    instructions: "Log in to PRTG and review any down or paused sensors; ignore Probe.",
    okLabel: "Checked",
  },
  {
    key: "ninjaone",
    label: "Ninja One",
    instructions:
      "(Every Monday) List any servers in maintenance mode. Exclude these approved servers: CGAZDC01, CGAZGW01, IDIRIS1, Tor-Dar-CRM2011.",
    okLabel: "Checked",
  },
  {
    key: "domain_ssl",
    label: "Client Domain/SSL Expire Status",
    instructions:
      "Check Autotask for SSL/domain expirations within 30 days, verify auto-renewal with the registrar, and notify the client if needed.",
    okLabel: "Checked",
  },
  {
    key: "shadowprotect",
    label: "Shadow Protect/Image Manager",
    instructions:
      "Log in to Shadow Control Console and review the status; also check Endpoints for their last backup date. Report if any endpoint doesn't show any backups. Review: Avcon, Insight.",
    okLabel: "Success",
  },
  {
    key: "esa_dropbox",
    label: "ESA Dropbox Review",
    instructions: "Log in to CGPRTG with the minerva02 user (check CG HUDU for this) and review that Dropbox is syncing.",
    okLabel: "Success",
  },
  {
    key: "veeam",
    label: "Veeam",
    instructions:
      "(Mondays, log in to the servers and check the jobs, and B2 offload) Review backup jobs from: CGBKP01, BMC: South-DC02, TOR-DAR-DC04, HBS-Backup, PF-DC02, PFB-DC01. Under the Computers section of the portal, review: EIW-SRV01.",
    okLabel: "Success",
  },
  {
    key: "crashplan",
    label: "CCF CrashPlan (Quickbooks)",
    instructions: "Review the backup report email sent by CrashPlan.",
    okLabel: "Success",
  },
  {
    key: "slide",
    label: "Slide Backups",
    instructions: 'Check the "Protected Systems" page on the Slide portal.',
    okLabel: "Checked",
  },
  {
    key: "datto_365",
    label: "Datto 365 Backups (SAAS)",
    instructions:
      "Review each client's protection percentage — paste the list below. Geminaq (50%) and Wolfedale (40%) are expected to stay flat (no OneDrive) — only flag them if that changes.",
    okLabel: "Checked",
  },
  {
    key: "datto_bcdr",
    label: "Datto Backups (BCDR)",
    instructions: "",
    okLabel: "Success",
  },
  {
    key: "datto_endpoints",
    label: "Datto End Points Backups",
    instructions:
      'Check "Endpoint Backup for PCs Status" in the Datto Partner Portal. Review: Schuller machines.',
    okLabel: "Success",
  },
  {
    key: "datto_endpoints_v2",
    label: "Datto End Points Backups V2",
    instructions: "Check https://cgtechnologiescom.backup.net/",
    okLabel: "Checked",
  },
  {
    key: "low_priority",
    label: "Low Priority Issues",
    instructions: "Anything worth noting that doesn't need immediate action.",
    okLabel: "Checked",
  },
];

export type BackupItemStatus = "pending" | "ok" | "issue" | "na";
