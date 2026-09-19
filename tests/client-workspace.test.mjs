import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { branchGeometry } from "../src/lib/branched-nav.ts";
import {
  CLIENT_SECTIONS,
  resolveClientView,
  resolveClientSection,
  sectionLegacyLabel,
  clientHref,
  normalizeOverviewOrder,
  validateClientDocument,
  isClientWorkOverdue,
  formatClientSourceTime,
} from "../src/lib/client-workspace.ts";

test("client view preference accepts only supported views", () => {
  assert.equal(resolveClientView(), "new");
  assert.equal(resolveClientView(undefined, "old"), "old");
  assert.equal(resolveClientView("new", "old"), "new");
  assert.equal(resolveClientView("invalid", "old"), "old");
});
test("client page gutter is desktop-only and does not indent nested dialog surfaces", () => {
  const css = readFileSync(
    new URL("../src/components/ui/client-surfaces.module.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /@media \(min-width: 768px\)\s*\{\s*\.pageGutter\s*\{\s*padding-inline-start: 28px;/,
  );
  for (const file of ["clients/directory.tsx", "clients/workspace.tsx"]) {
    const source = readFileSync(
      new URL(`../src/components/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /s\.workspace\} \$\{s\.pageGutter/);
  }
  const dialogs = readFileSync(
    new URL("../src/components/clients/activity.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(dialogs, /s\.pageGutter/);
});
test("curved branches align with every row and the active path reaches its branch", () => {
  const geometry = branchGeometry(3);
  assert.equal(geometry.height, 128);
  assert.equal(geometry.trunk, "M 10 0 V 95");
  assert.equal(geometry.branches[0].reach, "M 10 0 V 15 Q 10 24 19 24 H 28");
  assert.equal(geometry.branches[2].curve, "M 10 95 Q 10 104 19 104 H 28");
  assert.equal(branchGeometry(0).trunk, "");
  assert.equal(branchGeometry(0).branches.length, 0);
});
test("client navigation keeps links accessible while decorative paths animate", () => {
  const source = readFileSync(
    new URL("../src/components/ui/branched-nav.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /aria-current=/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /inert=\{!open\}/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /<motion.path/);
  assert.match(source, /<Link/);
});
test("new page controls do not reintroduce the redundant workspace header", () => {
  for (const file of [
    "dashboard-workspace.tsx",
    "my-todo/workspace.tsx",
    "clients/workspace.tsx",
    "clients/directory.tsx",
  ]) {
    const source = readFileSync(
      new URL(`../src/components/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /Workspace <span>|Client workspace<|className=\{(?:s|styles).topbar\}/,
    );
  }
});
test("client navigation has unique IDs and resolves every existing technical destination", () => {
  assert.equal(
    new Set(CLIENT_SECTIONS.map((item) => item.id)).size,
    CLIENT_SECTIONS.length,
  );
  assert.equal(resolveClientSection("unknown"), "overview");
  for (const section of CLIENT_SECTIONS)
    assert.equal(resolveClientSection(section.id), section.id);
  assert.equal(sectionLegacyLabel("identity", "risky"), "Risky Users");
  assert.equal(sectionLegacyLabel("identity", "access"), "Conditional Access");
  assert.equal(sectionLegacyLabel("identity", "detections"), "Risk Detections");
  assert.equal(sectionLegacyLabel("identity", "unknown"), "MFA & Sign-in");
  assert.equal(sectionLegacyLabel("intune", "policies"), "Intune Policies");
  assert.equal(sectionLegacyLabel("intune", "unknown"), "Intune Devices");
  assert.equal(
    CLIENT_SECTIONS.some((item) => /PRTG|password|PagerDuty/i.test(item.label)),
    false,
  );
});
test("section links preserve client, view and sub-section safely", () => {
  const url = new URL(
    clientHref("client/id", "identity", "risky"),
    "https://example.test",
  );
  assert.equal(url.pathname, "/clients/client%2Fid");
  assert.equal(url.searchParams.get("view"), "new");
  assert.equal(url.searchParams.get("section"), "identity");
  assert.equal(url.searchParams.get("sub"), "risky");
});
test("overview preferences cannot hide, duplicate or inject sections", () => {
  assert.deepEqual(normalizeOverviewOrder(["contact", "contact", "invalid"]), [
    "contact",
    "attention",
    "work",
    "activity",
  ]);
  assert.deepEqual(normalizeOverviewOrder(null), [
    "attention",
    "work",
    "activity",
    "contact",
  ]);
});
test("document selection matches supported file extensions and size limit", () => {
  for (const extension of ["PDF", "doc", "docx", "xls", "xlsx"])
    assert.equal(
      validateClientDocument({
        name: `file.${extension}`,
        size: 20 * 1024 * 1024,
      }),
      null,
    );
  assert.match(validateClientDocument({ name: "file.html", size: 1 }), /PDF/);
  assert.match(validateClientDocument({ name: "file.pdf", size: 0 }), /empty/);
  assert.match(
    validateClientDocument({ name: "file.pdf", size: 20 * 1024 * 1024 + 1 }),
    /20 MB/,
  );
});
test("date-only tasks due today are not overdue", () => {
  assert.equal(isClientWorkOverdue("2026-09-18", "2026-09-19"), true);
  assert.equal(isClientWorkOverdue("2026-09-19", "2026-09-19"), false);
  assert.equal(isClientWorkOverdue("2026-09-20", "2026-09-19"), false);
  assert.equal(isClientWorkOverdue(null, "2026-09-19"), false);
  assert.equal(isClientWorkOverdue("invalid", "2026-09-19"), false);
});
test("source timestamps have an explicit stable time zone", () => {
  assert.match(formatClientSourceTime("2026-09-19T12:00:00Z"), /UTC$/);
  assert.equal(formatClientSourceTime("invalid"), "Unavailable");
});
test("new workspace does not trigger automatic integration writes on navigation", () => {
  const source = readFileSync(
    new URL(
      "../src/app/(dashboard)/clients/[id]/legacy-client-page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /if \(canManageClients && !workspace\)/);
  assert.match(source, /loadSection\(\s*"devices",\s*\["devices"\],\s*\(\) =>/);
  assert.match(
    source,
    /loadSection\(\s*"conditional access",\s*\["identity-access"\],\s*\(\) =>/,
  );
  assert.match(
    source,
    /!workspace \|\| section === "reviews"\s*\? fetchReviewsForClient/,
  );
});
test("the new directory query remains name-only; preview is permission checked", () => {
  const directory = readFileSync(
    new URL("../src/app/(dashboard)/clients/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(directory, /select\("id, name"\)/);
  assert.doesNotMatch(directory, /select\([^)]*(owner_id|tasks|tickets)/);
  const preview = readFileSync(
    new URL(
      "../src/app/(dashboard)/clients/workspace-actions.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(preview, /requirePermission\("view_clients"\)/);
  assert.doesNotMatch(preview, /createAdminClient|select\("\*"\)/);
});
