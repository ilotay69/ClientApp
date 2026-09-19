import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultWorkspace,
  normalizeWorkspace,
  makeWidget,
  groupSeries,
  WIDGET_CATALOG,
  MAX_WIDGETS,
} from "../src/lib/dashboard-workspace.ts";

const eligible = WIDGET_CATALOG.map((item) => item.key);
test("recommended layout fits every breakpoint and is stable after normalization", () => {
  const config = defaultWorkspace(eligible);
  assert.equal(config.widgets.length, 5);
  assert.equal(config.view, "new");
  assert.deepEqual(normalizeWorkspace(config, eligible), config);
  for (const [name, cols] of [
    ["lg", 12],
    ["md", 6],
    ["sm", 1],
  ]) {
    for (const p of config.layouts[name]) assert.ok(p.x + p.w <= cols);
  }
});
test("invalid preferences recover to a permission-aware default", () => {
  for (const value of [null, [], "bad", {}, { version: 9, widgets: [] }]) {
    const config = normalizeWorkspace(value, ["my_tasks"]);
    assert.deepEqual(
      config.widgets.map((w) => w.source),
      ["my_tasks"],
    );
  }
});
test("intentionally empty boards, classic view, and compact density survive reload", () => {
  const config = {
    ...defaultWorkspace(eligible),
    view: "old",
    density: "compact",
    widgets: [],
    layouts: { lg: [], md: [], sm: [] },
  };
  assert.deepEqual(
    normalizeWorkspace(JSON.parse(JSON.stringify(config)), eligible),
    config,
  );
});
test("permission revocation strips data sources and all their placements", () => {
  const result = normalizeWorkspace(defaultWorkspace(eligible), ["my_tasks"]);
  assert.deepEqual(
    result.widgets.map((w) => w.source),
    ["my_tasks"],
  );
  for (const placements of Object.values(result.layouts))
    assert.deepEqual(
      placements.map((p) => p.i),
      ["my_tasks"],
    );
});
test("rejects duplicate and invalid ids, unknown sources, and limits board size", () => {
  const widgets = Array.from({ length: 40 }, (_, i) =>
    makeWidget("my_tasks", `card-${i}`),
  );
  const config = { ...defaultWorkspace(eligible), widgets };
  assert.equal(
    normalizeWorkspace(config, eligible).widgets.length,
    MAX_WIDGETS,
  );
  config.widgets = [
    widgets[0],
    widgets[0],
    { ...widgets[1], id: "<script>" },
    { ...widgets[2], source: "secret_data" },
  ];
  assert.equal(normalizeWorkspace(config, eligible).widgets.length, 1);
});
test("bounds hostile layout, presentation, text and category inputs", () => {
  const widget = {
    ...makeWidget("my_tasks", "one"),
    title: "x".repeat(400),
    display: "javascript",
    accent: "red;display:none",
    limit: 100,
  };
  const config = normalizeWorkspace(
    {
      version: 1,
      widgets: [widget],
      layouts: { lg: [{ i: "one", w: 200, h: -100, x: Infinity, y: -1 }] },
    },
    eligible,
  );
  assert.equal(config.widgets[0].title.length, 60);
  assert.equal(config.widgets[0].display, "list");
  assert.equal(config.widgets[0].accent, "brand");
  assert.equal(config.widgets[0].limit, 20);
  assert.deepEqual(config.layouts.lg[0], { i: "one", w: 12, h: 6, x: 0, y: 0 });
  assert.equal(config.layouts.sm[0].w, 1);
});
test("same-source widgets keep independent display preferences", () => {
  const widgets = [
    makeWidget("my_tasks", "one"),
    { ...makeWidget("my_tasks", "two"), display: "donut", accent: "blue" },
  ];
  const result = normalizeWorkspace({ version: 1, widgets }, eligible);
  assert.equal(result.widgets.length, 2);
  assert.equal(result.widgets[1].display, "donut");
});
test("grouping is accurate for missing labels and prototype-like strings", () => {
  assert.deepEqual(groupSeries(["on_hold", "on_hold", null, "constructor"]), [
    { label: "on hold", value: 2 },
    { label: "Unspecified", value: 1 },
    { label: "constructor", value: 1 },
  ]);
});
