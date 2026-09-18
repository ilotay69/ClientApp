// Split out from logged-hours.ts on purpose: that file imports
// @/lib/supabase/server (next/headers, service-role client) which cannot be
// bundled into client code. logged-hours-form.tsx ("use client") needs just
// this constant/type, so it imports from here instead - importing anything
// at all from logged-hours.ts would still pull its server-only import along
// for the ride even if unused, and break the client build.
export type LoggedHoursLabel = "regular" | "after_hours" | "taken_off";

export const LOGGED_HOURS_LABEL_OPTIONS: { value: LoggedHoursLabel; label: string }[] = [
  { value: "regular", label: "Regular" },
  { value: "after_hours", label: "After Hours" },
  { value: "taken_off", label: "Taken Off" },
];
