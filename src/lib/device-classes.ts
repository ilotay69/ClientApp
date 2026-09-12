// Pure, no imports — deliberately its own file rather than living in
// reconciliation-data.ts, which imports server-only code (createAdminClient,
// next/headers via lib/supabase/server). service-device-mappings-manager.tsx
// is a Client Component that needs DEVICE_CLASS_LABELS as a real runtime
// value (not just a type), so importing it from reconciliation-data.ts would
// pull that whole server-only module into the client bundle.

export type DeviceClass = "workstation" | "server" | "mac";

export const DEVICE_CLASS_LABELS: Record<DeviceClass, string> = {
  workstation: "Workstations",
  server: "Servers",
  mac: "Macs",
};
