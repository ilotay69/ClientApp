import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compactWidgetSeries,
  filterWidgetRecords,
  seriesCategory,
} from "../src/lib/dashboard-workspace.ts";
import { readDashboardSnapshot } from "../src/lib/dashboard-snapshot.ts";

test("snapshot reads past the default database page without losing records", async () => {
  const rows = Array.from({ length: 1234 }, (_, id) => ({ id }));
  const calls = [];
  const result = await readDashboardSnapshot(async (from, to) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.deepEqual(result.data, rows);
  assert.deepEqual(calls, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});

test("a later database failure never looks like a complete successful snapshot", async () => {
  const result = await readDashboardSnapshot(async (from) =>
    from === 0
      ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
      : { data: null, error: { message: "Connection interrupted" } },
  );
  assert.equal(result.data, null);
  assert.equal(result.error.message, "Connection interrupted");
});

test("project status filtering uses exact keys, not badge text or substring matches", () => {
  const rows = [
    { id: "1", category: "active", badge: "On hold", title: "Active project" },
    { id: "2", category: "on_hold", badge: "active", title: "Paused project" },
    { id: "3", category: "inactive", title: "Not active" },
    { id: "4", title: "active" },
  ];
  assert.deepEqual(
    filterWidgetRecords(rows, ["active"]).map((r) => r.id),
    ["1"],
  );
  assert.deepEqual(filterWidgetRecords(rows, []), []);
  assert.deepEqual(filterWidgetRecords(rows, ["unknown"]), []);
  assert.equal(filterWidgetRecords(rows, null), rows);
});

test("Other retains every hidden category without including unrelated records", () => {
  const series = ["Active", "Planning", "On hold", "Other", "Unspecified"].map(
    (label, i) => ({ key: String(i), label, value: i + 1 }),
  );
  const original = structuredClone(series);
  const compacted = compactWidgetSeries(series, 3);
  assert.deepEqual(compacted[2].categories, ["2", "3", "4"]);
  assert.equal(compacted[2].value, 12);
  const rows = series.map((point) => ({
    id: point.key,
    category: point.key,
    title: point.label,
  }));
  assert.deepEqual(
    filterWidgetRecords(rows, compacted[2].categories).map((r) => r.id),
    ["2", "3", "4"],
  );
  assert.deepEqual(series, original);
  assert.equal(compactWidgetSeries(series, 1)[0].value, 15);
});

test("same-name assignees stay separate by resource ID", () => {
  const series = compactWidgetSeries(
    [
      { key: "a", label: "Alex", value: 1 },
      { key: "b", label: "Alex", value: 2 },
    ],
    6,
  );
  const tasks = [
    { id: "1", category: "a" },
    { id: "2", category: "b" },
    { id: "3", category: "b" },
  ];
  assert.deepEqual(
    filterWidgetRecords(tasks, series[0].categories).map((r) => r.id),
    ["1"],
  );
});

test("View all and category records are independent of the widget display limit", () => {
  const rows = Array.from({ length: 85 }, (_, i) => ({
    id: String(i),
    category: i < 70 ? "active" : "planning",
    title: "Project",
  }));
  const points = compactWidgetSeries(
    [
      { key: "active", label: "Active", value: 70 },
      { key: "planning", label: "Planning", value: 15 },
    ],
    3,
  );
  assert.equal(filterWidgetRecords(rows, points[0].categories).length, 70);
  assert.equal(filterWidgetRecords(rows, null).length, 85);
});

test("missing integration labels use the same category as the chart", () => {
  assert.equal(seriesCategory(null), "Unspecified");
  assert.equal(seriesCategory(""), "Unspecified");
  assert.equal(seriesCategory("on_hold"), "on hold");
  assert.equal(seriesCategory("constructor"), "constructor");
  const rows = [{ id: "missing", category: seriesCategory(null) }];
  assert.equal(
    filterWidgetRecords(
      rows,
      compactWidgetSeries([{ label: "Unspecified", value: 1 }], 6)[0]
        .categories,
    ).length,
    1,
  );
});

test("card footer is outside the scrolling body and chart controls open accessible dialogs", () => {
  const source = readFileSync(
    new URL("../src/components/dashboard-widget-content.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<footer className=\{styles.widgetFooter\}>/);
  assert.match(source, /filterWidgetRecords\(records, selection.categories\)/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /event.key === "Enter"/);
  assert.doesNotMatch(source, /WidgetSnapshotDetails|preview =/);
  const css = readFileSync(
    new URL(
      "../src/components/dashboard-workspace.module.css",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(css, /\.widgetFooter\s*\{[^}]*flex-shrink: 0/s);
});
