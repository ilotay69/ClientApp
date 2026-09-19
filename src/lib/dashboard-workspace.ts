/** Shared, browser-safe workspace schema. No credentials or data fetching. */
export const WIDGET_CATALOG = [
  {
    key: "task_schedule",
    title: "Task outlook",
    description:
      "Your open tasks by due date, including overdue and unscheduled work.",
    group: "My work",
    display: "bars",
  },
  {
    key: "my_tasks",
    title: "My open tasks",
    description: "Assigned work, deadlines, and what needs attention.",
    group: "My work",
    display: "list",
  },
  {
    key: "my_personal_tasks",
    title: "Personal tasks",
    description: "Your private to-do list and due dates.",
    group: "My work",
    display: "list",
  },
  {
    key: "my_tickets",
    title: "My tickets",
    description: "Your live Autotask queue, grouped by priority.",
    group: "Service",
    display: "list",
  },
  {
    key: "alerts",
    title: "Attention centre",
    description: "Unacknowledged notifications addressed to you.",
    group: "My work",
    display: "list",
  },
  {
    key: "active_projects",
    title: "Project portfolio",
    description: "Active, planning, and on-hold projects at a glance.",
    group: "Delivery",
    display: "donut",
  },
  {
    key: "team_workload",
    title: "Team workload",
    description: "Open tasks by team member.",
    group: "Delivery",
    display: "bars",
  },
  {
    key: "hours_worked",
    title: "Team hours",
    description:
      "Time logged this month, with today and yesterday in the list.",
    group: "Delivery",
    display: "bars",
  },
  {
    key: "unassigned_l1_tickets",
    title: "Level 1 queue",
    description: "Unassigned support tickets, live from Autotask.",
    group: "Service",
    display: "list",
  },
  {
    key: "forticloud_expiring",
    title: "Support renewals",
    description: "FortiCloud support expired or expiring within 30 days.",
    group: "Service",
    display: "list",
  },
  {
    key: "touchpoints_due",
    title: "Overdue touchpoints",
    description: "Client follow-ups that need your attention.",
    group: "Clients",
    display: "list",
  },
  {
    key: "touchpoints_upcoming",
    title: "Upcoming touchpoints",
    description: "Scheduled client conversations and next steps.",
    group: "Clients",
    display: "list",
  },
  {
    key: "quarterly_reviews",
    title: "Quarterly reviews",
    description: "Your drafts and reviews awaiting your approval.",
    group: "Clients",
    display: "list",
  },
  {
    key: "sales_requests",
    title: "Sales pipeline",
    description: "Open internal sales requests by stage.",
    group: "Business",
    display: "bars",
  },
  {
    key: "recruitment",
    title: "Candidate pipeline",
    description: "Candidate counts across recruitment stages.",
    group: "Business",
    display: "bars",
  },
] as const;

export type SourceKey = (typeof WIDGET_CATALOG)[number]["key"];
export type Display = "list" | "bars" | "donut" | "metric";
export type Accent = "brand" | "charcoal" | "sage" | "blue";
export type Widget = {
  id: string;
  source: SourceKey;
  title: string;
  display: Display;
  accent: Accent;
  limit: number;
};
export type Placement = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Workspace = {
  version: 1;
  view: "old" | "new";
  density: "comfortable" | "compact";
  widgets: Widget[];
  layouts: Record<"lg" | "md" | "sm", Placement[]>;
};
export type SeriesPoint = { label: string; value: number };
export type WidgetRowData = {
  id: string;
  title: string;
  detail?: string;
  badge?: string;
  href?: string;
  urgent?: boolean;
};
export type WidgetData = {
  key: SourceKey;
  value: number;
  unit: string;
  href?: string;
  series: SeriesPoint[];
  rows: WidgetRowData[];
  empty: string;
  error?: string;
};
export const DISPLAY_LABELS: Record<Display, string> = {
  list: "List",
  bars: "Bar chart",
  donut: "Donut chart",
  metric: "Number",
};
export const ACCENT_COLORS: Record<Accent, string> = {
  brand: "#e93e3f",
  charcoal: "#343738",
  sage: "#567c69",
  blue: "#397b9d",
};
export const MAX_WIDGETS = 24;

export function makeWidget(source: SourceKey, id: string): Widget {
  const def = WIDGET_CATALOG.find((item) => item.key === source)!;
  return {
    id,
    source,
    title: def.title,
    display: def.display,
    accent: source === "active_projects" ? "charcoal" : "brand",
    limit: 6,
  };
}

export function defaultWorkspace(eligible: readonly string[]): Workspace {
  const keys: SourceKey[] = [
    "task_schedule",
    "active_projects",
    "my_tasks",
    "alerts",
    "team_workload",
    "my_personal_tasks",
    "my_tickets",
  ];
  const widgets = keys
    .filter((key) => eligible.includes(key))
    .slice(0, 5)
    .map((key) => makeWidget(key, key));
  const lg = widgets.map((w, index): Placement =>
    index === 0
      ? { i: w.id, x: 0, y: 0, w: 8, h: 9 }
      : index === 1
        ? { i: w.id, x: 8, y: 0, w: 4, h: 9 }
        : {
            i: w.id,
            x: ((index - 2) % 3) * 4,
            y: 9 + Math.floor((index - 2) / 3) * 9,
            w: 4,
            h: 9,
          },
  );
  return {
    version: 1,
    view: "new",
    density: "comfortable",
    widgets,
    layouts: {
      lg,
      md: widgets.map((w, index) => ({
        i: w.id,
        x: (index % 2) * 3,
        y: Math.floor(index / 2) * 9,
        w: 3,
        h: 9,
      })),
      sm: widgets.map((w, index) => ({
        i: w.id,
        x: 0,
        y: index * 9,
        w: 1,
        h: 9,
      })),
    },
  };
}

/** Treat both saved JSON and action arguments as untrusted. Permission-filter
 * sources and bound sizes, counts, text, and positions before use or storage. */
export function normalizeWorkspace(
  input: unknown,
  eligible: readonly string[],
): Workspace {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return defaultWorkspace(eligible);
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.widgets))
    return defaultWorkspace(eligible);
  const ids = new Set<string>();
  const widgets: Widget[] = [];
  for (const entry of raw.widgets.slice(0, MAX_WIDGETS)) {
    if (!entry || typeof entry !== "object") continue;
    const w = entry as Record<string, unknown>;
    const def = WIDGET_CATALOG.find((item) => item.key === w.source);
    if (
      !def ||
      !eligible.includes(def.key) ||
      typeof w.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(w.id) ||
      ids.has(w.id)
    )
      continue;
    ids.add(w.id);
    widgets.push({
      ...makeWidget(def.key, w.id),
      title:
        typeof w.title === "string"
          ? w.title.trim().slice(0, 60) || def.title
          : def.title,
      display: ["list", "bars", "donut", "metric"].includes(String(w.display))
        ? (w.display as Display)
        : def.display,
      accent: ["brand", "charcoal", "sage", "blue"].includes(String(w.accent))
        ? (w.accent as Accent)
        : "brand",
      limit: clamp(w.limit, 3, 20, 6),
    });
  }
  const layouts = {} as Workspace["layouts"];
  const rawLayouts =
    raw.layouts && typeof raw.layouts === "object"
      ? (raw.layouts as Record<string, unknown>)
      : {};
  for (const [breakpoint, cols] of [
    ["lg", 12],
    ["md", 6],
    ["sm", 1],
  ] as const) {
    const list = Array.isArray(rawLayouts[breakpoint])
      ? (rawLayouts[breakpoint] as Record<string, unknown>[])
      : [];
    layouts[breakpoint] = widgets.map((widget, index) => {
      const p = list.find((value) => value && value.i === widget.id) ?? {};
      const w = clamp(p.w, Math.min(3, cols), cols, Math.min(4, cols));
      return {
        i: widget.id,
        w,
        h: clamp(p.h, 6, 18, 9),
        x: clamp(p.x, 0, cols - w, 0),
        y: clamp(p.y, 0, 1000, index * 9),
      };
    });
  }
  return {
    version: 1,
    view: raw.view === "old" ? "old" : "new",
    density: raw.density === "compact" ? "compact" : "comfortable",
    widgets,
    layouts,
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function groupSeries(
  values: (string | null | undefined)[],
): SeriesPoint[] {
  const totals = new Map<string, number>();
  for (const value of values) {
    const label = value?.replaceAll("_", " ") || "Unspecified";
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  return [...totals].map(([label, value]) => ({ label, value }));
}
