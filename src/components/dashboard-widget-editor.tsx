"use client";

import { useState, type CSSProperties } from "react";
import {
  ACCENT_COLORS,
  DISPLAY_LABELS,
  WIDGET_CATALOG,
  type Widget,
  type WidgetData,
  type Workspace,
  type Display,
  type Accent,
} from "@/lib/dashboard-workspace";
import { AnimatedTabs } from "./ui/animated-tabs";
import { CGSelect } from "./ui/cg-select";
import { DashboardWidgetSize } from "./dashboard-widget-size";
import { WidgetContent } from "./dashboard-widget-content";
import s from "./dashboard-widget-editor.module.css";

const ACCENT_NAMES: Record<Accent, string> = {
  brand: "CG red",
  charcoal: "Charcoal",
  sage: "Sage",
  blue: "Blue",
};

/** Edits the existing dashboard draft; nothing saves until Save layout. */
export function DashboardWidgetEditor({
  widget,
  data,
  width,
  height,
  density,
  canMoveEarlier,
  canMoveLater,
  onChange,
  onSize,
  onMove,
  onRemove,
  onDone,
}: {
  widget: Widget;
  data?: WidgetData;
  width: number;
  height: number;
  density: Workspace["density"];
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onChange: (patch: Partial<Widget>) => void;
  onSize: (width?: number, height?: number) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const [section, setSection] = useState<"appearance" | "layout">("appearance");
  const color = ACCENT_COLORS[widget.accent];
  return (
    <div
      className={s.editor}
      style={{ "--widget-accent": color } as CSSProperties}
    >
      <AnimatedTabs
        className={s.tabs}
        label="Widget settings sections"
        value={section}
        onChange={setSection}
        items={[
          { value: "appearance", label: "Appearance" },
          { value: "layout", label: "Size & position" },
        ]}
      />
      <div className={s.content}>
        {section === "appearance" ? (
          <>
            <label className={s.field}>
              Widget title
              <input
                value={widget.title}
                maxLength={60}
                onChange={(e) => onChange({ title: e.target.value })}
              />
            </label>
            <fieldset className={s.fieldset}>
              <legend>Display as</legend>
              <AnimatedTabs
                className={s.displayOptions}
                label="Widget display style"
                value={widget.display}
                onChange={(display: Display) => onChange({ display })}
                items={Object.entries(DISPLAY_LABELS).map(([value, label]) => ({
                  value: value as Display,
                  label,
                }))}
              />
            </fieldset>
            <fieldset className={s.fieldset}>
              <legend>
                Accent <span>{ACCENT_NAMES[widget.accent]}</span>
              </legend>
              <div className={s.swatches}>
                {Object.entries(ACCENT_COLORS).map(([key, value]) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={`${ACCENT_NAMES[key as Accent]} accent`}
                    aria-pressed={widget.accent === key}
                    onClick={() => onChange({ accent: key as Accent })}
                  >
                    <span
                      className={s.swatch}
                      style={{ background: value }}
                      aria-hidden="true"
                    >
                      {widget.accent === key ? "✓" : ""}
                    </span>
                    {ACCENT_NAMES[key as Accent]}
                  </button>
                ))}
              </div>
            </fieldset>
            <section
              className={s.preview}
              aria-label="Widget appearance preview"
            >
              <div className={s.previewHeading}>
                <strong>{widget.title || "Untitled widget"}</strong>
                <span>Preview</span>
              </div>
              <div className={s.previewContent}>
                {data ? (
                  <WidgetContent
                    widget={{ ...widget, limit: Math.min(widget.limit, 3) }}
                    data={data}
                    preview
                  />
                ) : (
                  <div
                    className={s.sample}
                    aria-label="Style sample only; live data is loaded on the dashboard"
                  >
                    <span className={s.sampleLabel}>
                      Style sample · live data stays on the dashboard
                    </span>
                    {widget.display === "metric" ? (
                      <strong className={s.sampleMetric}>—</strong>
                    ) : widget.display === "donut" ? (
                      <div className={s.sampleDonut} aria-hidden="true" />
                    ) : (
                      <div
                        className={
                          widget.display === "bars"
                            ? s.sampleBars
                            : s.sampleRows
                        }
                        aria-hidden="true"
                      >
                        {[75, 45, 60].map((w, i) => (
                          <span key={i} style={{ width: `${w}%` }} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className={s.hint}>
                Accent updates immediately. Priority and warning colours stay
                unchanged.
              </p>
            </section>
            <details className={s.about}>
              <summary>About this widget</summary>
              <p>
                {
                  WIDGET_CATALOG.find((item) => item.key === widget.source)
                    ?.description
                }
              </p>
              <p>
                Preview shows up to three rows or categories, not the final
                widget size.
              </p>
            </details>
          </>
        ) : (
          <>
            <DashboardWidgetSize
              width={width}
              height={height}
              density={density}
              onChange={onSize}
            />
            {widget.display !== "metric" && (
              <CGSelect
                label={
                  widget.display === "list"
                    ? "Items to show"
                    : "Categories to show"
                }
                value={String(widget.limit)}
                onChange={(value) => onChange({ limit: Number(value) })}
                options={Array.from({ length: 18 }, (_, i) => ({
                  value: String(i + 3),
                  label: `Up to ${i + 3} ${widget.display === "list" ? "items" : "categories"}`,
                }))}
              />
            )}
            <fieldset className={s.fieldset}>
              <legend>Position</legend>
              <div className={s.position}>
                <button
                  type="button"
                  disabled={!canMoveEarlier}
                  onClick={() => onMove(-1)}
                >
                  ← Earlier
                </button>
                <button
                  type="button"
                  disabled={!canMoveLater}
                  onClick={() => onMove(1)}
                >
                  Later →
                </button>
              </div>
            </fieldset>
            <p className={s.hint}>
              You can also drag and resize widgets directly on the dashboard.
            </p>
          </>
        )}
      </div>
      <footer className={s.footer}>
        <p>
          Draft changes · use <strong>Save layout</strong> to keep them.
        </p>
        <div>
          <button type="button" className={s.remove} onClick={onRemove}>
            Remove widget
          </button>
          <button type="button" className={s.done} onClick={onDone}>
            Done
          </button>
        </div>
      </footer>
    </div>
  );
}
