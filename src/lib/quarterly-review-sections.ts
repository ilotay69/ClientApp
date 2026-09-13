// The quarterly client system review's fixed section/item list — mirrors
// the existing Word/PDF review template exactly (same sections, same line
// items, same 4-state Healthy/Need Attention/Need Urgent Attention/N/A
// status legend). Pure data, no imports — safe to use from both server code
// (the emailed report) and client components (the checklist form).

export type QuarterlyReviewItemStatus = "healthy" | "attention" | "urgent" | "na";

export const QUARTERLY_STATUS_LABELS: Record<QuarterlyReviewItemStatus, string> = {
  healthy: "Healthy",
  attention: "Need Attention",
  urgent: "Need Urgent Attention",
  na: "N/A",
};

export type QuarterlyReviewItem = { key: string; label: string };
export type QuarterlyReviewSection = { key: string; label: string; items: QuarterlyReviewItem[] };

export const QUARTERLY_REVIEW_SECTIONS: QuarterlyReviewSection[] = [
  {
    key: "physical_servers",
    label: "Physical Servers",
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
    items: [
      { key: "bo_365_restore", label: "365 Backups Restore Test" },
      { key: "bo_workstation_backups", label: "Workstation Backups" },
      { key: "bo_workstation_restore", label: "Workstation Backups Restore Test" },
    ],
  },
  {
    key: "active_directory",
    label: "Active Directory",
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
    items: [
      { key: "misc_phishfence", label: "Update Phish Fence VIP List" },
      { key: "misc_mdr", label: "MDR (Configuration — Check Endpoint Status)" },
    ],
  },
];
