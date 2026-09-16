// The quarterly client system review's fixed section/item list — mirrors
// the existing Word/PDF review template exactly (same sections, same line
// items, same 4-state Healthy/Need Attention/Need Urgent Attention/N/A
// status legend). Pure data, no imports — safe to use from both server code
// (the emailed report) and client components (the checklist form).

export type QuarterlyReviewItemStatus = "healthy" | "attention" | "urgent" | "na" | "recommended";

export const QUARTERLY_STATUS_LABELS: Record<QuarterlyReviewItemStatus, string> = {
  healthy: "Healthy",
  attention: "Need Attention",
  urgent: "Need Urgent Attention",
  na: "N/A",
  recommended: "Recommended",
};

// Display order for the item status buttons (see quarterly-review-item-row.tsx)
// — low-concern to high-concern, with the "suggest something" option
// between Healthy and Need Attention rather than at either end.
export const QUARTERLY_STATUS_ORDER: QuarterlyReviewItemStatus[] = [
  "na",
  "healthy",
  "recommended",
  "attention",
  "urgent",
];

export type QuarterlyReviewItem = { key: string; label: string };
export type QuarterlyReviewSection = { key: string; label: string; description: string; items: QuarterlyReviewItem[] };

// Which checklist a review is built from, picked once when the review is
// started (NewQuarterlyReviewForm) and stored on quarterly_reviews.template
// — every later read (the checklist page, the PDF, the AI analysis) looks
// it up via getQuarterlyReviewSections(review.template) rather than
// assuming one fixed list, since the two templates' item keys differ.
export type QuarterlyReviewTemplateKey = "standard" | "avd";

export const QUARTERLY_REVIEW_TEMPLATE_LABELS: Record<QuarterlyReviewTemplateKey, string> = {
  standard: "Standard",
  avd: "AVD",
};

export const STANDARD_SECTIONS: QuarterlyReviewSection[] = [
  {
    key: "physical_servers",
    label: "Physical Servers",
    description: "Resource usage, updates, backups, and hardware age.",
    items: [
      { key: "ps_resources", label: "Resources Usage" },
      { key: "ps_mgmt_card", label: "Management Card Access & Notifications Test" },
      { key: "ps_virtual_host_access", label: "Virtual Host Access (ESXi, vCentre(443), Hyper-V, etc.)" },
      { key: "ps_vm_snapshots", label: "Virtual Machine Snapshots Check (exclude Backup Snapshots)" },
      { key: "ps_windows_updates", label: "Windows Updates Status" },
      { key: "ps_antivirus", label: "Antivirus Status" },
      { key: "ps_eol_server", label: "EOL Physical Server (<5 years)" },
      { key: "ps_eol_os", label: "EOL Operating System" },
      { key: "ps_other", label: "Other Abnormalities" },
    ],
  },
  {
    key: "virtual_servers",
    label: "Virtual Servers",
    description: "Hypervisor updates, resource usage, and virtual machine health.",
    items: [
      { key: "vs_windows_updates", label: "Windows Updates Status" },
      { key: "vs_resources", label: "Resources Usage" },
      { key: "vs_vcentre_updates", label: "VMware vCentre Virtual Server Updates" },
      { key: "vs_antivirus", label: "Antivirus Status" },
      { key: "vs_other", label: "Other Abnormalities" },
    ],
  },
  {
    key: "workstations",
    label: "Workstations",
    description: "Windows updates, antivirus, and resource usage.",
    items: [
      {
        key: "ws_windows_updates",
        label: "Windows Update Status (feature updates applied biannually, not included)",
      },
      { key: "ws_antivirus", label: "Antivirus Status" },
      { key: "ws_resources", label: "Resource Usage" },
      { key: "ws_other", label: "Other Abnormalities" },
    ],
  },
  {
    key: "network_devices",
    label: "Network Devices",
    description: "Firewalls, switches, wireless access points, and NAS.",
    items: [
      { key: "nd_nas", label: "NAS — Resource Usage and Notifications Test" },
      { key: "nd_firewall_updates", label: "Firewall Version Updates" },
      { key: "nd_firewall_subscription", label: "Firewall Subscription Status" },
      { key: "nd_firewall_config_backup", label: "Firewall Configuration Backup" },
      { key: "nd_firewall_access", label: "Firewall Management Access Restrictions" },
      { key: "nd_switch_login", label: "Managed Switch Login Test" },
      { key: "nd_wifi_aps", label: "WiFi Access Points Online/Offline" },
    ],
  },
  {
    key: "internet_domains",
    label: "Internet and Domains",
    description: "Connectivity, domain renewals, and SSL certificates.",
    items: [
      { key: "id_speed_test", label: "Internet Speed Test (flag if well below agreed ISP speed)" },
      { key: "id_backup_internet", label: "Backup Internet Status" },
      { key: "id_domain_expiry", label: "Domain Expiry" },
      { key: "id_ssl_expiry", label: "SSL Certificates Expiry" },
    ],
  },
  {
    key: "backups_servers",
    label: "Backups and Redundancy — Servers",
    description: "Local and offsite server backup coverage and restore tests.",
    items: [
      { key: "bs_all_included", label: "All Servers Included in the Backup Job(s)" },
      { key: "bs_local_success", label: "Local Backups Successful" },
      { key: "bs_offsite_success", label: "Offsite Backups Successful" },
      { key: "bs_local_file_restore", label: "Local Backups File Restore Test" },
      { key: "bs_offsite_file_restore", label: "Offsite Backups Files Restore Test" },
      { key: "bs_local_vm_restore", label: "Local Virtual Machine Restore Test (at least one VM)" },
      { key: "bs_offsite_vm_restore", label: "Offsite Virtual Machine Restore Test (at least one VM)" },
    ],
  },
  {
    key: "backups_other",
    label: "Backups and Redundancy — Other",
    description: "Microsoft 365 and workstation backup coverage.",
    items: [
      { key: "bo_365_restore", label: "365 Backups Restore Test" },
      { key: "bo_workstation_backups", label: "Workstation Backups" },
      { key: "bo_workstation_restore", label: "Workstation Backups Restore Test" },
    ],
  },
  {
    key: "active_directory",
    label: "Active Directory",
    description: "Replication, stale accounts, and admin group membership.",
    items: [
      { key: "ad_dc_replication", label: "Domain Controller Replication Tests (multi-DC environments only)" },
      { key: "ad_deactivate_stale", label: "Deactivate Computers Not Logged In >90 Days" },
      { key: "ad_connect_sync", label: "AD Connect — Sync Successful" },
      { key: "ad_admin_review", label: "Administrator/Enterprise/Domain Admin Group Members Review" },
      { key: "ad_password_policy", label: "Password Policy (current vs. recommended settings)" },
      { key: "ad_stale_users", label: "Users Not Logged In >90 Days" },
    ],
  },
  {
    key: "miscellaneous",
    label: "Miscellaneous",
    description: "Additional services and vendor-specific checks.",
    items: [
      { key: "misc_phishfence", label: "Update Phish Fence VIP List" },
      { key: "misc_mdr", label: "MDR (Configuration — Check Endpoint Status)" },
    ],
  },
];

// Mirrors "(company) AVD Quarterly System Review (Month Year).docx" — the
// separate template used for clients on Azure Virtual Desktop, with no
// on-prem physical servers/workstations/network devices of their own to
// check, plus its own "Other Security Services" section not present in
// the Standard template. Keys are all "avd_"-prefixed (even where the
// wording matches a Standard item) so the two templates' item sets never
// collide when both are combined for lookups (e.g. quarterly-review-pdf.ts's
// LABEL_BY_KEY).
export const AVD_SECTIONS: QuarterlyReviewSection[] = [
  {
    key: "avd_virtual_servers_hosts",
    label: "Virtual Servers and AVD Hosts",
    description: "Resource usage, updates, backups, and OS support status.",
    items: [
      { key: "avd_windows_updates", label: "Windows Updates Status" },
      { key: "avd_resources", label: "Resources Usage" },
      { key: "avd_vcentre_updates", label: "VMware vCentre Virtual Server Updates" },
      { key: "avd_eol_os", label: "EOL Operating System" },
      { key: "avd_antivirus", label: "Antivirus Status" },
      { key: "avd_other", label: "Other Abnormalities" },
    ],
  },
  {
    key: "avd_internet_domains",
    label: "Internet and Domains",
    description: "Connectivity, domain renewals, and SSL certificates.",
    items: [
      { key: "avd_speed_test", label: "Internet Speed Test (flag if well below agreed ISP speed)" },
      { key: "avd_backup_internet", label: "Backup Internet Status" },
      { key: "avd_domain_expiry", label: "Domain Expiry" },
      { key: "avd_ssl_expiry", label: "SSL Certificates Expiry" },
    ],
  },
  {
    key: "avd_backups_servers",
    label: "Backups and Redundancy — Servers",
    description: "Server backup coverage and restore tests.",
    items: [
      { key: "avd_bs_all_included", label: "All Servers Included in the Backup Job(s)" },
      { key: "avd_bs_success", label: "Backups Successful" },
      { key: "avd_bs_file_restore", label: "Backups File Restore Test" },
    ],
  },
  {
    key: "avd_backups_other",
    label: "Backups and Redundancy — Other",
    description: "Microsoft 365 backup coverage.",
    items: [{ key: "avd_bo_365_restore", label: "365 Backups Restore Test" }],
  },
  {
    key: "avd_active_directory",
    label: "Active Directory",
    description: "Sync status, admin group membership, and password policy.",
    items: [
      { key: "avd_ad_connect_sync", label: "AD Connect — Sync Successful" },
      { key: "avd_ad_admin_review", label: "Administrator/Enterprise/Domain Admin Group Members Review" },
      { key: "avd_ad_password_policy", label: "Password Policy (current vs. recommended settings)" },
      { key: "avd_ad_stale_users", label: "Users Not Logged In >90 Days" },
      { key: "avd_ad_stale_computers", label: "Computers Not Logged In >90 Days" },
    ],
  },
  {
    key: "avd_other_security",
    label: "Other Security Services",
    description: "Microsoft 365 and firewall-level security controls.",
    items: [
      { key: "avd_sec_mfa", label: "365 MFA Enabled" },
      { key: "avd_sec_geo_365", label: "365 Geo Restrictions Enabled" },
      { key: "avd_sec_review_admins", label: "Review 365 Admin Accounts (exclude CG)" },
      { key: "avd_sec_auditing", label: "365 Auditing is ON" },
      { key: "avd_sec_firewall_geo", label: "Firewall Geo Restrictions Enabled" },
      { key: "avd_sec_antispam", label: "Antispam Solution Implemented" },
    ],
  },
  {
    key: "avd_miscellaneous",
    label: "Miscellaneous",
    description: "Additional services and mailbox/storage housekeeping.",
    items: [
      { key: "avd_misc_phishfence", label: "Update Inky Phish Fence VIP List" },
      { key: "avd_misc_mdr", label: "Managed Detection and Response (MDR) Status" },
      { key: "avd_misc_mailbox_storage", label: "Review 365 User Mailbox Storage" },
      { key: "avd_misc_sharepoint_storage", label: "Review SharePoint Tenant Storage" },
    ],
  },
];

export const QUARTERLY_REVIEW_TEMPLATES: Record<QuarterlyReviewTemplateKey, QuarterlyReviewSection[]> = {
  standard: STANDARD_SECTIONS,
  avd: AVD_SECTIONS,
};

/** The section/item list for a given review — defaults to "standard" for
 * null/undefined/unrecognized values so an old review predating the
 * template column (or a bad value) never crashes, just renders as
 * Standard. */
export function getQuarterlyReviewSections(
  template: QuarterlyReviewTemplateKey | string | null | undefined
): QuarterlyReviewSection[] {
  return QUARTERLY_REVIEW_TEMPLATES[template as QuarterlyReviewTemplateKey] ?? STANDARD_SECTIONS;
}

// Every item key across both templates, combined — used where a lookup
// needs to work regardless of which template a particular review used
// (e.g. quarterly-review-pdf.ts's LABEL_BY_KEY). Safe to flatten together
// since the "avd_" prefix guarantees no key collides with a Standard one.
export const ALL_TEMPLATE_SECTIONS: QuarterlyReviewSection[] = [...STANDARD_SECTIONS, ...AVD_SECTIONS];
