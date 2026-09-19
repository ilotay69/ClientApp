import test from "node:test";
import assert from "node:assert/strict";
import {
  canAnimateWorkspaceMetric,
  noticeTimeout,
  boundedWholeNumber,
} from "../src/lib/workspace-controls.ts";

test("only non-critical allowlisted totals animate", () => {
  for (const source of ["my_tasks", "my_personal_tasks", "active_projects"])
    assert.equal(canAnimateWorkspaceMetric(source), true);
  for (const source of [
    "alerts",
    "task_schedule",
    "backups",
    "failed_backups",
    "unassigned_l1_tickets",
    "forticloud_expiring",
    "touchpoints_due",
    "new_unknown_source",
  ])
    assert.equal(canAnimateWorkspaceMetric(source), false);
});
test("errors and Undo actions never auto-dismiss", () => {
  assert.equal(noticeTimeout(false, false), 6000);
  assert.equal(noticeTimeout(true, false), 0);
  assert.equal(noticeTimeout(false, true), 0);
  assert.equal(noticeTimeout(true, true), 0);
});
test("precision controls commit bounded whole dimensions", () => {
  assert.equal(boundedWholeNumber(12, 3, 12), 12);
  assert.equal(boundedWholeNumber(999, 3, 12), 12);
  assert.equal(boundedWholeNumber(-3, 3, 12), 3);
  assert.equal(boundedWholeNumber(7.6, 3, 12), 8);
  assert.equal(boundedWholeNumber(0, 6, 18), 6);
  assert.equal(boundedWholeNumber(19, 6, 18), 18);
  for (const value of [null, NaN, Infinity, -Infinity])
    assert.equal(boundedWholeNumber(value, 3, 12), null);
});
