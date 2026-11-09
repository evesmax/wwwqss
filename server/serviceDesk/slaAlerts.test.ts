import test from "node:test";
import assert from "node:assert/strict";
import { thresholdsCrossed, targetsFor, DEFAULT_ESCALATION } from "./slaAlerts";

test("thresholds crossed", () => {
  assert.deepEqual(thresholdsCrossed(0.2, false), []);
  assert.deepEqual(thresholdsCrossed(0.5, false), [50]);
  assert.deepEqual(thresholdsCrossed(0.92, false), [50, 75, 90]);
  assert.deepEqual(thresholdsCrossed(1.3, true), [50, 75, 90, 100]);
  assert.deepEqual(thresholdsCrossed(1, false), [50, 75, 90]); // exactly at target is not yet breached
});
test("escalation by severity", () => {
  assert.deepEqual(targetsFor(DEFAULT_ESCALATION, "P0", 100), ["assignee", "manager", "owner"]);
  assert.deepEqual(targetsFor(DEFAULT_ESCALATION, "P1", 50), ["assignee"]);
  assert.deepEqual(targetsFor(DEFAULT_ESCALATION, "P3", 50), []);
  assert.deepEqual(targetsFor(DEFAULT_ESCALATION, null, 100), ["assignee", "manager"]);
});
import { alertKey, SLA_EDIT_WINDOW } from "./slaAlerts";
test("update alerts are keyed by window so each new window can alert again", () => {
  assert.equal(alertKey("resolution", new Date(5)), "resolution");
  assert.notEqual(alertKey("update", new Date(1000)), alertKey("update", new Date(2000)));
  assert.ok(SLA_EDIT_WINDOW > 0);
});
