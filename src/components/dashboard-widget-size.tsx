"use client";

import { useId } from "react";
import {
  WIDGET_WIDTHS,
  WIDGET_HEIGHTS,
  widgetHeightPixels,
  widgetWidthLabel,
  type Workspace,
} from "@/lib/dashboard-workspace";
import styles from "./dashboard-widget-size.module.css";
import { PrecisionField } from "./ui/precision-field";
import { CGSelect } from "./ui/cg-select";

export function DashboardWidgetSize({
  width,
  height,
  density,
  onChange,
}: {
  width: number;
  height: number;
  density: Workspace["density"];
  onChange: (width?: number, height?: number) => void;
}) {
  const id = useId();
  const heightLabel =
    WIDGET_HEIGHTS.find((size) => size.value === height)?.label ??
    "Custom height";
  const pixels = widgetHeightPixels(height, density);
  const widthLabel = widgetWidthLabel(width);

  return (
    <section className={styles.sizing} aria-labelledby={`${id}-heading`}>
      <div className={styles.heading}>
        <h3 id={`${id}-heading`}>Widget size</h3>
        <span>Desktop layout</span>
      </div>
      <div className={styles.preview}>
        <div className={styles.previewCanvas} aria-hidden="true">
          <div
            className={styles.previewWidget}
            style={{
              width: `${(width / 12) * 100}%`,
              height: `${(pixels / widgetHeightPixels(18, density)) * 100}%`,
            }}
          >
            <span />
            <span />
            <span />
          </div>
        </div>
        <p className={styles.summary} role="status" aria-live="polite">
          <strong>
            {widthLabel} · {heightLabel}
          </strong>
          <span>
            {Math.round((width / 12) * 100)}% of dashboard width · {pixels}px
            high
          </span>
        </p>
      </div>
      <div className={styles.selectors}>
        <div className={styles.selectField}>
          <span>Width</span>
          <CGSelect
            label="Width"
            value={String(width)}
            onChange={(value) => onChange(Number(value))}
            options={[
              ...(!WIDGET_WIDTHS.some((size) => size.value === width)
                ? [{ value: String(width), label: widthLabel }]
                : []),
              ...WIDGET_WIDTHS.map((size) => ({
                value: String(size.value),
                label: `${size.label} · ${size.detail}`,
              })),
            ]}
          />
        </div>
        <div className={styles.selectField}>
          <span>Height</span>
          <CGSelect
            label="Height"
            value={String(height)}
            onChange={(value) => onChange(undefined, Number(value))}
            options={[
              ...(!WIDGET_HEIGHTS.some((size) => size.value === height)
                ? [{ value: String(height), label: `Custom · ${pixels}px` }]
                : []),
              ...WIDGET_HEIGHTS.map((size) => ({
                value: String(size.value),
                label: `${size.label} · ${widgetHeightPixels(size.value, density)}px`,
              })),
            ]}
          />
        </div>
      </div>
      <p className={styles.hint}>
        Desktop proportions, not actual scale. Widgets automatically fill the
        row on phones.
      </p>
      <details className={styles.precision}>
        <summary>Fine-tune size</summary>
        <PrecisionField
          label="Width in columns"
          value={width}
          min={3}
          max={12}
          onChange={(value) => onChange(value)}
          hint={`${width} of 12 columns · ${Math.round((width / 12) * 100)}% of the row`}
        />
        <PrecisionField
          label="Height in rows"
          value={height}
          min={6}
          max={18}
          onChange={(value) => onChange(undefined, value)}
          hint={`${pixels}px high at the current spacing`}
        />
        <p className={styles.hint}>
          Type a value, use + / −, or drag a field label. Your size preview
          updates above.
        </p>
      </details>
    </section>
  );
}
