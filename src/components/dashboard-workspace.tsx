"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type ResponsiveLayouts,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import {
  IconRefresh,
  IconSliders,
  IconGrid,
  IconSearch,
} from "@/components/icons";
import {
  WIDGET_CATALOG,
  ACCENT_COLORS,
  DISPLAY_LABELS,
  MAX_WIDGETS,
  WIDGET_ROW_HEIGHT,
  resizeWorkspaceWidget,
  makeWidget,
  defaultWorkspace,
  normalizeWorkspace,
  type Workspace,
  type Widget,
  type WidgetData,
  type SourceKey,
  type Display,
  type Accent,
} from "@/lib/dashboard-workspace";
import {
  WidgetContent,
  LiveWidgetContent,
  DashboardOrb,
} from "./dashboard-widget-content";
import styles from "./dashboard-workspace.module.css";
import { DashboardWidgetSize } from "./dashboard-widget-size";
import { AnimatedDialog } from "./ui/animated-dialog";
import { AnimatedTabs } from "./ui/animated-tabs";
import { HoverGroup, HoverButton } from "./ui/hover-surface";
import { BentoCard, BentoGrid } from "./ui/bento-card";
import { StatefulButton } from "./ui/stateful-button";
import { AnimatedTooltip } from "./ui/context-preview";
import { CGSelect } from "./ui/cg-select";
import { StatusMark } from "./ui/status-mark";
import { NoticeRegion, useNotices } from "./ui/notice-toast";
import { canAnimateWorkspaceMetric } from "@/lib/workspace-controls";

type Props = {
  initialWorkspace: Workspace;
  eligible: string[];
  data: WidgetData[];
  greeting: string;
  updatedAt: string;
  stats: {
    label: string;
    value: number;
    href: string;
    unavailable?: boolean;
  }[];
  saveAction: (workspace: Workspace) => Promise<{ error?: string }>;
  loadError?: string;
  children: ReactNode;
};

export function DashboardWorkspace({
  initialWorkspace,
  eligible,
  data,
  greeting,
  updatedAt,
  stats,
  saveAction,
  loadError,
  children,
}: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialWorkspace);
  const [draft, setDraft] = useState(initialWorkspace);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const { manager: notices, notify } = useNotices();
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"library" | "reset" | string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [refreshing, refresh] = useTransition();
  // Measure a persistent element: switching to Old view unmounts the grid.
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
  });
  const config = editing ? draft : saved;
  const dataByKey = useMemo(
    () => new Map(data.map((item) => [item.key, item])),
    [data],
  );
  const catalog = WIDGET_CATALOG.filter((item) => eligible.includes(item.key));
  const selection = config.widgets.find((item) => item.id === dialog);
  const date = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(updatedAt));
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(updatedAt));
  const gridLayouts: ResponsiveLayouts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(config.layouts).map(([key, placements]) => [
          key,
          placements.map((p) => ({
            ...p,
            minW: key === "sm" ? 1 : 3,
            minH: 6,
            maxH: 18,
          })),
        ]),
      ),
    [config.layouts],
  );

  function beginEdit(library = false) {
    setDraft(saved);
    setEditing(true);
    setMessage("");
    setError("");
    if (library) setDialog("library");
  }
  async function save(next: Workspace) {
    setSaving(true);
    setError("");
    try {
      const normalized = normalizeWorkspace(next, eligible);
      const result = await saveAction(normalized);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(normalized);
      setDraft(normalized);
      setEditing(false);
      setDialog(null);
      setMessage("");
      notify("Workspace saved", { id: "workspace-save" });
    } catch {
      setError("Couldn’t save your workspace. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  async function changeView(view: "old" | "new") {
    const next = { ...saved, view };
    setSaved(next);
    setDraft(next);
    setMessage("");
    setError("");
    if (loadError) return;
    setSaving(true);
    try {
      const result = await saveAction(next);
      if (result.error)
        setError(
          "View changed for this visit, but couldn’t be saved. Try again later.",
        );
    } catch {
      setError(
        "View changed for this visit, but couldn’t be saved. Try again later.",
      );
    } finally {
      setSaving(false);
    }
  }
  function addWidget(source: SourceKey) {
    if (draft.widgets.length >= MAX_WIDGETS) return;
    const widget = makeWidget(source, crypto.randomUUID());
    setDraft((current) => ({
      ...current,
      widgets: [...current.widgets, widget],
      layouts: Object.fromEntries(
        Object.entries(current.layouts).map(([key, placements]) => [
          key,
          [
            ...placements,
            {
              i: widget.id,
              x: 0,
              y: Math.max(0, ...placements.map((p) => p.y + p.h)),
              w: key === "sm" ? 1 : key === "md" ? 3 : 4,
              h: 9,
            },
          ],
        ]),
      ) as Workspace["layouts"],
    }));
    setDialog(widget.id);
    setMessage(`${widget.title} added`);
  }
  function updateWidget(id: string, patch: Partial<Widget>) {
    setDraft((current) => ({
      ...current,
      widgets: current.widgets.map((w) =>
        w.id === id ? { ...w, ...patch } : w,
      ),
    }));
  }
  function removeWidget(id: string) {
    setDraft((current) => ({
      ...current,
      widgets: current.widgets.filter((w) => w.id !== id),
      layouts: Object.fromEntries(
        Object.entries(current.layouts).map(([key, layout]) => [
          key,
          layout.filter((p) => p.i !== id),
        ]),
      ) as Workspace["layouts"],
    }));
    setDialog(null);
  }
  function moveWidget(id: string, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.widgets.findIndex((w) => w.id === id);
      const other = current.widgets[index + direction];
      if (!other) return current;
      const widgets = [...current.widgets];
      [widgets[index], widgets[index + direction]] = [
        widgets[index + direction],
        widgets[index],
      ];
      const layouts = Object.fromEntries(
        Object.entries(current.layouts).map(([key, layout]) => {
          const a = layout.find((p) => p.i === id)!;
          const b = layout.find((p) => p.i === other.id)!;
          return [
            key,
            layout.map((p) =>
              p.i === id
                ? { ...b, i: id }
                : p.i === other.id
                  ? { ...a, i: other.id }
                  : p,
            ),
          ];
        }),
      ) as Workspace["layouts"];
      return { ...current, widgets, layouts };
    });
  }
  function sizeWidget(id: string, span?: number, height?: number) {
    setDraft((current) => resizeWorkspaceWidget(current, id, span, height));
  }
  function updateLayouts(layouts: ResponsiveLayouts) {
    if (!editing) return;
    setDraft((current) => {
      const merged = { ...current.layouts, ...layouts };
      const next = normalizeWorkspace(
        { ...current, layouts: merged },
        eligible,
      );
      return JSON.stringify(next.layouts) === JSON.stringify(current.layouts)
        ? current
        : next;
    });
  }

  const viewSwitch = (
    <AnimatedTabs
      className={styles.viewSwitch}
      label="Dashboard view"
      value={saved.view}
      disabled={editing || saving}
      onChange={changeView}
      items={[
        { value: "old", label: "Old view" },
        {
          value: "new",
          label: (
            <>
              <IconGrid className={styles.icon} />
              New view
            </>
          ),
        },
      ]}
    />
  );
  return (
    <div
      ref={containerRef}
      className={styles.workspace}
      data-density={config.density}
    >
      {(error || loadError) && (
        <div className={styles.error} role="alert">
          {error || loadError}
        </div>
      )}
      {saved.view === "old" ? (
        <div className={styles.classic}>
          <div className={styles.classicViewControls}>{viewSwitch}</div>
          {children}
        </div>
      ) : (
        <div className={styles.modern}>
          <NoticeRegion manager={notices} />
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>DASHBOARD</p>
              <h1>
                {greeting}
                <span>.</span>
              </h1>
              <p className={styles.subtitle}>{date}</p>
            </div>
            <div className={styles.headerActions}>
              {viewSwitch}
              <AnimatedTooltip content="Reload the dashboard and live integrations">
                <StatefulButton
                  className={styles.button}
                  status={refreshing ? "pending" : "idle"}
                  pendingLabel="Refreshing…"
                  icon={<IconRefresh className={styles.icon} />}
                  disabled={saving || editing}
                  onClick={() => refresh(() => router.refresh())}
                >
                  Refresh
                </StatefulButton>
              </AnimatedTooltip>
              {editing ? (
                <>
                  <button
                    className={styles.button}
                    disabled={saving}
                    onClick={() => {
                      setEditing(false);
                      setDialog(null);
                      setError("");
                      setDraft(saved);
                    }}
                  >
                    Cancel
                  </button>
                  <StatefulButton
                    className={styles.primaryButton}
                    status={saving ? "pending" : error ? "error" : "idle"}
                    errorLabel="Retry save"
                    onClick={() => save(draft)}
                  >
                    Save layout
                  </StatefulButton>
                </>
              ) : (
                <>
                  <button
                    className={styles.button}
                    disabled={!!loadError || saving}
                    onClick={() => beginEdit()}
                  >
                    <IconSliders className={styles.icon} />
                    Customize
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={!!loadError || saving}
                    onClick={() => beginEdit(true)}
                  >
                    <span className={styles.plus}>+</span>Add widget
                  </button>
                </>
              )}
            </div>
          </header>
          <BentoGrid className={styles.summary} aria-label="Today’s priorities">
            {stats.map((stat, i) => (
              <Link href={stat.href} key={stat.label} className={styles.stat}>
                <span className={styles.statLabel}>
                  <span
                    className={styles.statDot}
                    style={{
                      background:
                        i === 0 && stat.value > 0 ? "#e93e3f" : "#969e98",
                    }}
                  />
                  {stat.label}
                  <span className={styles.statArrow}>↗</span>
                </span>
                <strong>
                  {stat.unavailable ? "—" : stat.value.toLocaleString("en-CA")}
                </strong>
                <span className={styles.statCaption}>
                  {stat.unavailable
                    ? "Data unavailable · Refresh to retry"
                    : stat.value === 0
                      ? "Nothing outstanding"
                      : "Ready for your attention"}
                </span>
              </Link>
            ))}
          </BentoGrid>
          <div className={styles.boardHeading}>
            <div>
              <h2>Dashboard widgets</h2>
              <span>
                {config.widgets.length} widgets{" "}
                <span className={styles.divider}>/</span> Customize to move,
                resize or configure.
              </span>
            </div>
            <span className={styles.updated} role="status">
              <StatusMark
                state={refreshing ? "running" : "idle"}
                label={
                  refreshing
                    ? "Refreshing data…"
                    : message || `Updated ${time} · Toronto`
                }
              />
            </span>
          </div>
          {editing && (
            <div className={styles.editBar}>
              <span>
                <strong>Editing layout.</strong> Drag a card by its handle; pull
                a corner to resize. Changes save when you’re ready.
              </span>
              <div>
                <label>
                  Spacing{" "}
                  <CGSelect
                    label="Widget spacing"
                    disabled={saving}
                    value={draft.density}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        density: value as Workspace["density"],
                      }))
                    }
                    options={[
                      { value: "comfortable", label: "Comfortable" },
                      { value: "compact", label: "Compact" },
                    ]}
                  />
                </label>
                <button
                  className={styles.textButton}
                  onClick={() => setDialog("reset")}
                  disabled={saving}
                >
                  Reset layout
                </button>
                <button
                  className={styles.smallButton}
                  disabled={saving || draft.widgets.length >= MAX_WIDGETS}
                  onClick={() => setDialog("library")}
                >
                  + Add widget
                </button>
              </div>
            </div>
          )}
          <div className={styles.gridWrap} data-editing={editing}>
            {!config.widgets.length ? (
              <div className={styles.emptyBoard}>
                <IconGrid className={styles.emptyBoardIcon} />
                <h3>No widgets added</h3>
                <p>Choose the information to show on your dashboard.</p>
                <button
                  className={styles.primaryButton}
                  disabled={!!loadError || saving}
                  onClick={() =>
                    editing ? setDialog("library") : beginEdit(true)
                  }
                >
                  + Add your first widget
                </button>
              </div>
            ) : !mounted ? (
              <DashboardOrb label="Preparing your workspace…" />
            ) : (
              <ResponsiveGridLayout
                width={width}
                layouts={gridLayouts}
                breakpoints={{ lg: 1050, md: 640, sm: 0 }}
                cols={{ lg: 12, md: 6, sm: 1 }}
                rowHeight={WIDGET_ROW_HEIGHT}
                margin={config.density === "compact" ? [12, 12] : [20, 20]}
                containerPadding={[0, 0]}
                dragConfig={{
                  enabled: editing && !saving,
                  handle: ".widget-drag-handle",
                  cancel: "button, input, select, a",
                }}
                resizeConfig={{ enabled: editing && !saving, handles: ["se"] }}
                onLayoutChange={(_layout, layouts) => updateLayouts(layouts)}
              >
                {config.widgets.map((widget) => (
                  <div
                    key={widget.id}
                    className={styles.gridItem}
                    style={
                      {
                        "--widget-accent": ACCENT_COLORS[widget.accent],
                      } as CSSProperties
                    }
                  >
                    <BentoCard
                      className={`${styles.widget} ${widget.display === "metric" ? styles.metricWidget : ""}`}
                      aria-label={widget.title}
                    >
                      <div className={styles.widgetHeader}>
                        <div className={styles.widgetHeading}>
                          {editing && (
                            <span
                              className={`widget-drag-handle ${styles.dragHandle}`}
                              aria-hidden="true"
                              title="Drag to reposition"
                            >
                              ⠿
                            </span>
                          )}
                          <span className={styles.widgetDot} />
                          <h3>{widget.title}</h3>
                        </div>
                        {editing ? (
                          <button
                            className={styles.widgetSettings}
                            aria-label={`Configure ${widget.title}`}
                            disabled={saving}
                            onClick={() => setDialog(widget.id)}
                          >
                            <IconSliders className={styles.icon} />
                          </button>
                        ) : (
                          <span className={styles.displayTag}>
                            {DISPLAY_LABELS[widget.display]}
                          </span>
                        )}
                      </div>
                      <div
                        className={styles.widgetContent}
                        key={
                          canAnimateWorkspaceMetric(widget.source)
                            ? widget.id
                            : `${widget.id}-${updatedAt}`
                        }
                      >
                        {dataByKey.has(widget.source) ? (
                          <WidgetContent
                            widget={widget}
                            data={dataByKey.get(widget.source)!}
                          />
                        ) : (
                          <LiveWidgetContent widget={widget} />
                        )}
                      </div>
                    </BentoCard>
                  </div>
                ))}
              </ResponsiveGridLayout>
            )}
          </div>
          <footer className={styles.footer}>
            <span>
              <span className={styles.footerMark}>CG</span> Operations
            </span>
            <span>
              CG Technologies <span>·</span> Operations workspace
            </span>
          </footer>
        </div>
      )}
      <>
        <WorkspaceDialog
          open={!!dialog}
          title={
            dialog === "library"
              ? "Add widgets"
              : dialog === "reset"
                ? "Reset layout?"
                : "Widget settings"
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "library" ? (
            <>
              <p className={styles.dialogIntro}>
                Choose a widget. Add a second copy to see the same data in a
                different way.
              </p>
              <label className={styles.search}>
                <IconSearch className={styles.icon} />
                <input
                  placeholder="Search widgets…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search widgets"
                />
              </label>
              <HoverGroup className={styles.catalog}>
                {catalog
                  .filter((item) =>
                    `${item.title} ${item.description} ${item.group}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((item) => (
                    <HoverButton
                      className={styles.catalogItem}
                      key={item.key}
                      disabled={draft.widgets.length >= MAX_WIDGETS}
                      onClick={() => addWidget(item.key)}
                    >
                      <span className={styles.catalogGlyph}>
                        <IconGrid className={styles.icon} />
                      </span>
                      <span>
                        <small>{item.group}</small>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </span>
                      <span className={styles.plus}>+</span>
                    </HoverButton>
                  ))}
                {!catalog.some((item) =>
                  `${item.title} ${item.description} ${item.group}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ) && <p>No widgets match that search.</p>}
              </HoverGroup>
              <p className={styles.dialogNote}>
                {draft.widgets.length} of {MAX_WIDGETS} widgets · Only widgets
                you have permission to use are listed.
              </p>
            </>
          ) : dialog === "reset" ? (
            <>
              <p className={styles.dialogIntro}>
                Restore the recommended widgets, sizes, and positions. You can
                still cancel editing to recover your saved layout.
              </p>
              <button
                className={styles.primaryButton}
                onClick={() => {
                  setDraft(defaultWorkspace(eligible));
                  setDialog(null);
                }}
              >
                Restore recommended layout
              </button>
            </>
          ) : selection ? (
            <div
              className={styles.editor}
              style={
                {
                  "--widget-accent": ACCENT_COLORS[selection.accent],
                } as CSSProperties
              }
            >
              <p className={styles.dialogIntro}>
                {
                  WIDGET_CATALOG.find((w) => w.key === selection.source)
                    ?.description
                }
              </p>
              <label>
                Widget title
                <input
                  value={selection.title}
                  maxLength={60}
                  onChange={(e) =>
                    updateWidget(selection.id, { title: e.target.value })
                  }
                />
              </label>
              <fieldset>
                <legend>Display as</legend>
                <div className={styles.displayOptions}>
                  {Object.entries(DISPLAY_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={selection.display === key}
                      onClick={() =>
                        updateWidget(selection.id, { display: key as Display })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Accent</legend>
                <div className={styles.swatches}>
                  {Object.entries(ACCENT_COLORS).map(([key, color]) => (
                    <button
                      aria-label={`${key} accent`}
                      aria-pressed={selection.accent === key}
                      key={key}
                      style={{ background: color }}
                      onClick={() =>
                        updateWidget(selection.id, { accent: key as Accent })
                      }
                    >
                      {selection.accent === key && "✓"}
                    </button>
                  ))}
                </div>
              </fieldset>
              <DashboardWidgetSize
                key={selection.id}
                width={
                  draft.layouts.lg.find((p) => p.i === selection.id)?.w ?? 4
                }
                height={
                  draft.layouts.lg.find((p) => p.i === selection.id)?.h ?? 9
                }
                density={draft.density}
                onChange={(span, height) =>
                  sizeWidget(selection.id, span, height)
                }
              />
              {selection.display !== "metric" && (
                <label>
                  {selection.display === "list"
                    ? "Items to show"
                    : "Categories to show"}
                  <CGSelect
                    label={
                      selection.display === "list"
                        ? "Items to show"
                        : "Categories to show"
                    }
                    value={String(selection.limit)}
                    onChange={(value) =>
                      updateWidget(selection.id, {
                        limit: Number(value),
                      })
                    }
                    options={Array.from({ length: 18 }, (_, i) => ({
                      value: String(i + 3),
                      label: `Up to ${i + 3} ${selection.display === "list" ? "items" : "categories"}`,
                    }))}
                  />
                  <span className={styles.fieldHint}>
                    Controls the amount of content, not the widget’s size.
                  </span>
                </label>
              )}
              <fieldset>
                <legend>Position</legend>
                <div className={styles.fieldPair}>
                  <button
                    className={styles.button}
                    disabled={draft.widgets[0]?.id === selection.id}
                    onClick={() => moveWidget(selection.id, -1)}
                  >
                    ← Move earlier
                  </button>
                  <button
                    className={styles.button}
                    disabled={draft.widgets.at(-1)?.id === selection.id}
                    onClick={() => moveWidget(selection.id, 1)}
                  >
                    Move later →
                  </button>
                </div>
              </fieldset>
              <div className={styles.editorFooter}>
                <button
                  className={styles.dangerButton}
                  onClick={() => removeWidget(selection.id)}
                >
                  Remove widget
                </button>
                <button
                  className={styles.primaryButton}
                  onClick={() => setDialog(null)}
                >
                  Done
                </button>
              </div>
              <p className={styles.fieldHint}>
                Changes are a preview. Choose Save layout on the dashboard to
                keep them.
              </p>
            </div>
          ) : null}
        </WorkspaceDialog>
      </>
    </div>
  );
}

function WorkspaceDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AnimatedDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      variant="drawer"
      className={styles.dialog}
      bodyClassName={styles.dialogInner}
    >
      {children}
    </AnimatedDialog>
  );
}
