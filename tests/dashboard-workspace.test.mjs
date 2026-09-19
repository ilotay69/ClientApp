import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultWorkspace,
  normalizeWorkspace,
  makeWidget,
  groupSeries,
  WIDGET_CATALOG,
  MAX_WIDGETS,
  WIDGET_WIDTHS,
  WIDGET_HEIGHTS,
  widgetHeightPixels,
  widgetWidthLabel,
  resizeWorkspaceWidget,
  ACCENT_COLORS,
} from "../src/lib/dashboard-workspace.ts";

const eligible = WIDGET_CATALOG.map((item) => item.key);
test("all widget accents survive serialization independently of display and layout", () => {
  for (const accent of Object.keys(ACCENT_COLORS)) {
    for (const display of ["list", "bars", "donut", "metric"]) {
      const config = defaultWorkspace(eligible);
      config.widgets[0] = { ...config.widgets[0], accent, display };
      const saved = normalizeWorkspace(
        JSON.parse(JSON.stringify(config)),
        eligible,
      );
      assert.equal(saved.widgets[0].accent, accent);
      assert.equal(saved.widgets[0].display, display);
      assert.deepEqual(saved.layouts, config.layouts);
      assert.deepEqual(saved.widgets.slice(1), config.widgets.slice(1));
    }
  }
});
test("editor preview is read-only and its size guide inherits the selected accent", () => {
  const content = readFileSync(
    new URL("../src/components/dashboard-widget-content.tsx", import.meta.url),
    "utf8",
  );
  assert.match(content, /data.key === "alerts" && !preview/);
  assert.match(content, /const rowHref = preview \? undefined/);
  const size = readFileSync(
    new URL(
      "../src/components/dashboard-widget-size.module.css",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(size, /background: var\(--widget-accent, #e93e3f\)/);
  const editor = readFileSync(
    new URL("../src/components/dashboard-widget-editor.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    editor,
    /LiveWidgetContent|fetchLiveDashboardWidget|acknowledgeDashboardAlert/,
  );
});
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

test("visual width presets are human-readable and custom sizes stay custom", () => {
  for (const { value, label } of WIDGET_WIDTHS)
    assert.equal(widgetWidthLabel(value), label);
  assert.equal(widgetWidthLabel(5), "Custom (42%)");
  assert.equal(widgetWidthLabel(11), "Custom (92%)");
});
test("height labels include the grid gaps for each density", () => {
  assert.equal(widgetHeightPixels(6, "comfortable"), 244);
  assert.equal(widgetHeightPixels(9, "comfortable"), 376);
  assert.equal(widgetHeightPixels(9, "compact"), 312);
  assert.equal(widgetHeightPixels(18, "comfortable"), 772);
});
test("every width and height preset fits all breakpoints and survives saving", () => {
  const original = defaultWorkspace(eligible);
  const id = original.widgets[1].id; // Starts on the right edge of the desktop grid.
  for (const { value: width } of WIDGET_WIDTHS) {
    for (const { value: height } of WIDGET_HEIGHTS) {
      const result = resizeWorkspaceWidget(original, id, width, height);
      for (const [breakpoint, cols] of [
        ["lg", 12],
        ["md", 6],
        ["sm", 1],
      ]) {
        const placement = result.layouts[breakpoint].find((p) => p.i === id);
        assert.ok(placement.x + placement.w <= cols);
        assert.equal(placement.h, height);
        assert.deepEqual(
          result.layouts[breakpoint].filter((p) => p.i !== id),
          original.layouts[breakpoint].filter((p) => p.i !== id),
        );
      }
      assert.equal(result.layouts.lg.find((p) => p.i === id).w, width);
      assert.equal(
        result.layouts.md.find((p) => p.i === id).w,
        width > 4 ? 6 : 3,
      );
      assert.equal(result.layouts.sm.find((p) => p.i === id).w, 1);
      assert.deepEqual(
        normalizeWorkspace(JSON.parse(JSON.stringify(result)), eligible),
        result,
      );
    }
  }
  assert.deepEqual(original, defaultWorkspace(eligible)); // Draft operations do not mutate saved state.
});
test("fine tuning preserves custom dimensions and independent responsive widths", () => {
  const original = defaultWorkspace(eligible);
  const id = original.widgets[0].id;
  const custom = resizeWorkspaceWidget(original, id, 7, 11);
  const taller = resizeWorkspaceWidget(custom, id, undefined, 13);
  assert.equal(taller.layouts.lg[0].w, 7);
  const wider = resizeWorkspaceWidget(custom, id, 10);
  assert.equal(wider.layouts.lg[0].h, 11);
  assert.deepEqual(normalizeWorkspace(custom, eligible), custom);
  for (const breakpoint of ["lg", "md", "sm"]) {
    const before = original.layouts[breakpoint][0];
    const after = resizeWorkspaceWidget(original, id, undefined, 15).layouts[
      breakpoint
    ][0];
    assert.deepEqual(after, { ...before, h: 15 });
  }
});
test("size updates clamp invalid inputs and ignore unknown widget ids", () => {
  const original = defaultWorkspace(eligible);
  const result = resizeWorkspaceWidget(
    original,
    original.widgets[0].id,
    30,
    -1,
  );
  assert.equal(result.layouts.lg[0].w, 12);
  assert.equal(result.layouts.lg[0].h, 6);
  assert.deepEqual(resizeWorkspaceWidget(original, "missing", 6, 12), original);
});
