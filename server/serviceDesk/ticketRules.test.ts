import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTransition, validateSeverity, timestampsFor, ticketKey, initialStatus, nextStatuses } from "./ticketRules";

const base = { type: "incident", severity: "P2" as string | null };
test("ticketKey pads and keeps prefix", () => { assert.equal(ticketKey("ROT", 142), "ROT-0142"); assert.equal(ticketKey("ROT", 12345), "ROT-12345"); });
test("initial status depends on type", () => { assert.equal(initialStatus("incident"), "new"); assert.equal(initialStatus("feature_request"), "requested"); });
test("valid and invalid ops transitions", () => {
  assert.equal(validateTransition({ ...base, from: "new", to: "triage" }).ok, true);
  assert.equal(validateTransition({ ...base, from: "new", to: "closed" }).ok, false);
  assert.deepEqual(nextStatuses("incident", "duplicate"), []);
});
test("feature uses its own machine", () => {
  assert.equal(validateTransition({ type: "feature_request", severity: null, from: "requested", to: "in_review" }).ok, true);
  assert.equal(validateTransition({ type: "feature_request", severity: null, from: "requested", to: "triage" }).ok, false);
});
test("waiting_third_party and rejected need a reason", () => {
  assert.equal(validateTransition({ ...base, from: "in_progress", to: "waiting_third_party" }).ok, false);
  assert.equal(validateTransition({ ...base, from: "in_progress", to: "waiting_third_party", reason: "Proveedor DNS" }).ok, true);
  assert.equal(validateTransition({ ...base, from: "new", to: "rejected" }).ok, false);
});
test("P0/P1 resolve needs full RCA; P2 does not", () => {
  assert.equal(validateTransition({ ...base, severity: "P1", from: "in_progress", to: "resolved" }).ok, false);
  assert.equal(validateTransition({ ...base, severity: "P1", from: "in_progress", to: "resolved", rca: { cause: "a", fix: "b", prevention: "c" } }).ok, false);
  assert.equal(validateTransition({ ...base, severity: "P0", from: "in_progress", to: "resolved", rca: { cause: "a", fix: "b", prevention: "c", kind: "code" } }).ok, true);
  assert.equal(validateTransition({ ...base, from: "in_progress", to: "resolved" }).ok, true);
});
test("reopen from closed only within window; from resolved always", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  assert.equal(validateTransition({ ...base, from: "closed", to: "in_progress", closedAt: new Date("2026-11-10T00:00:00Z"), now }).ok, true);
  assert.equal(validateTransition({ ...base, from: "closed", to: "in_progress", closedAt: new Date("2026-10-01T00:00:00Z"), now }).ok, false);
  assert.equal(validateTransition({ ...base, from: "closed", to: "in_progress", closedAt: null, now }).ok, false);
  assert.equal(validateTransition({ ...base, from: "resolved", to: "in_progress" }).ok, true);
});
test("severity only for incidents; P0 needs questionnaire", () => {
  assert.equal(validateSeverity("question", "P1").ok, false);
  assert.equal(validateSeverity("incident", null).ok, true);
  assert.equal(validateSeverity("incident", "P2").ok, true);
  assert.equal(validateSeverity("incident", "P0").ok, false);
  assert.equal(validateSeverity("incident", "P0", { inaccessible: true, hasWorkaround: true, users: 5 }).ok, false);
  assert.equal(validateSeverity("incident", "P0", { inaccessible: true, hasWorkaround: false, users: 5 }).ok, true);
  assert.equal(validateSeverity("incident", "P9").ok, false);
});
test("timestampsFor sets and clears", () => {
  const now = new Date();
  assert.deepEqual(timestampsFor("resolved", now), { resolvedAt: now });
  assert.deepEqual(timestampsFor("closed", now), { closedAt: now });
  assert.deepEqual(timestampsFor("in_progress", now), { resolvedAt: null, closedAt: null });
});
