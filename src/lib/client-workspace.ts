export const CLIENT_VIEW_COOKIE = "cg-clients-view";
export type ClientView = "old" | "new";
export function resolveClientView(query?: string, saved?: string): ClientView {
  return query === "old" || query === "new"
    ? query
    : saved === "old"
      ? "old"
      : "new";
}

export const CLIENT_SECTIONS = [
  { id: "overview", label: "Overview", group: "", legacy: "Overview" },
  {
    id: "contacts",
    label: "Contacts",
    group: "Relationship",
    legacy: "Contacts",
  },
  {
    id: "activity",
    label: "Activity",
    group: "Relationship",
    legacy: "Timeline",
  },
  { id: "touchpoints", label: "Touchpoints", group: "Relationship" },
  {
    id: "reviews",
    label: "Quarterly reviews",
    group: "Relationship",
    legacy: "Quarterly Reviews",
  },
  {
    id: "tickets",
    label: "Tickets / PSA",
    group: "Work & services",
    legacy: "Tickets",
  },
  { id: "tasks", label: "Tasks", group: "Work & services" },
  { id: "projects", label: "Projects", group: "Work & services" },
  { id: "sales", label: "Internal sales", group: "Work & services" },
  {
    id: "contracts",
    label: "Contracts & services",
    group: "Work & services",
    legacy: "Contract Services",
  },
  {
    id: "devices",
    label: "Devices",
    group: "Systems & continuity",
    legacy: "Devices",
  },
  {
    id: "intune",
    label: "Intune",
    group: "Systems & continuity",
    legacy: "Intune Devices",
  },
  {
    id: "domain",
    label: "Domain health",
    group: "Systems & continuity",
    legacy: "Domain Health",
  },
  {
    id: "licenses",
    label: "M365 licenses",
    group: "Cloud & security",
    legacy: "M365 Licenses",
  },
  {
    id: "mailboxes",
    label: "Mailboxes",
    group: "Cloud & security",
    legacy: "Mailbox Usage",
  },
  {
    id: "identity",
    label: "Identity & risk",
    group: "Cloud & security",
    legacy: "MFA & Sign-in",
  },
  {
    id: "score",
    label: "Secure Score",
    group: "Cloud & security",
    legacy: "Secure Score",
  },
  {
    id: "huntress",
    label: "Huntress",
    group: "Cloud & security",
    legacy: "Huntress",
  },
  { id: "documents", label: "Documents", group: "Knowledge & access" },
  { id: "settings", label: "Client settings", group: "Settings" },
  { id: "connections", label: "Connections", group: "Settings" },
] as const;
export type ClientSection = (typeof CLIENT_SECTIONS)[number]["id"];
export function resolveClientSection(value?: string): ClientSection {
  return CLIENT_SECTIONS.some((s) => s.id === value)
    ? (value as ClientSection)
    : "overview";
}
export function clientHref(
  id: string,
  section: string = "overview",
  sub?: string,
) {
  const params = new URLSearchParams({ view: "new", section });
  if (sub) params.set("sub", sub);
  return `/clients/${encodeURIComponent(id)}?${params}`;
}
export function sectionLegacyLabel(
  section: ClientSection,
  sub?: string,
): string | undefined {
  if (section === "intune")
    return sub === "policies" ? "Intune Policies" : "Intune Devices";
  if (section === "identity")
    return (
      (
        {
          access: "Conditional Access",
          risky: "Risky Users",
          detections: "Risk Detections",
        } as Record<string, string>
      )[sub ?? ""] ?? "MFA & Sign-in"
    );
  const entry = CLIENT_SECTIONS.find((s) => s.id === section);
  return entry && "legacy" in entry ? entry.legacy : undefined;
}

export const OVERVIEW_SECTIONS = [
  "attention",
  "work",
  "activity",
  "contact",
] as const;
export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];
export function normalizeOverviewOrder(value: unknown): OverviewSection[] {
  const order = Array.isArray(value)
    ? value.filter((id): id is OverviewSection =>
        OVERVIEW_SECTIONS.includes(id),
      )
    : [];
  return [...new Set([...order, ...OVERVIEW_SECTIONS])];
}
export function validateClientDocument(file: { name: string; size: number }) {
  if (!/\.(pdf|docx?|xlsx?)$/i.test(file.name))
    return "Choose a PDF, Word, or Excel document.";
  if (!file.size) return "This file is empty.";
  if (file.size > 20 * 1024 * 1024) return "The maximum file size is 20 MB.";
  return null;
}

/** Date-only work is due through the end of its due date, not midnight. */
export function isClientWorkOverdue(dueDate: string | null, today: string) {
  return Boolean(
    dueDate &&
    /^\d{4}-\d{2}-\d{2}/.test(dueDate) &&
    dueDate.slice(0, 10) < today,
  );
}
export function formatClientSourceTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return `${new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;
}
