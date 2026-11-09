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
