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
      <fieldset className={styles.choices}>
        <legend>How much of the row?</legend>
        <div className={styles.widthOptions}>
          {WIDGET_WIDTHS.map((size) => (
            <button
              type="button"
              key={size.value}
              aria-pressed={width === size.value}
              aria-label={`${size.label}, ${size.detail} of dashboard width`}
              onClick={() => onChange(size.value)}
            >
              <span className={styles.widthTrack} aria-hidden="true">
                <span style={{ width: `${(size.value / 12) * 100}%` }} />
              </span>
              <strong>{size.label}</strong>
              <small>{size.detail}</small>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.choices}>
        <legend>How tall?</legend>
        <div className={styles.heightOptions}>
          {WIDGET_HEIGHTS.map((size) => (
            <button
              type="button"
              key={size.value}
              aria-pressed={height === size.value}
              onClick={() => onChange(undefined, size.value)}
            >
              <strong>{size.label}</strong>
              <small>{widgetHeightPixels(size.value, density)}px</small>
            </button>
          ))}
        </div>
      </fieldset>
      <p className={styles.hint}>
        Size guide, not actual scale. On phones, widgets fill the row. Smaller
        screens use two columns for narrow widgets and full width for wider
        ones.
      </p>
      <details className={styles.precision}>
        <summary>Fine-tune size</summary>
        <label htmlFor={`${id}-width`}>
          <span>
            Width <strong>{Math.round((width / 12) * 100)}%</strong>
          </span>
          <input
            id={`${id}-width`}
            type="range"
            min={3}
            max={12}
            step={1}
            value={width}
            aria-valuetext={`${widthLabel}, ${width} of 12 columns`}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </label>
        <label htmlFor={`${id}-height`}>
          <span>
            Height <strong>{pixels}px</strong>
          </span>
          <input
            id={`${id}-height`}
            type="range"
            min={6}
            max={18}
            step={1}
            value={height}
            aria-valuetext={`${heightLabel}, ${pixels} pixels`}
            onChange={(event) =>
              onChange(undefined, Number(event.target.value))
            }
          />
        </label>
      </details>
    </section>
  );
}
