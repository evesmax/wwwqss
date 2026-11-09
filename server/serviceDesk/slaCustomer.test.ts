import test from "node:test";
import assert from "node:assert/strict";
import { toCustomerSla } from "./slaCustomer";
import type { MetricResult } from "./slaEngine";

const m = (o: Partial<MetricResult>): MetricResult => ({ key: "resolution", targetMs: 3_600_000, elapsedMs: 1_800_000, remainingMs: 1_800_000, dueAt: new Date("2026-11-05T10:00:00Z"),
  pctUsed: 0.5, state: "running", paused: false, pauses: [], startedAt: new Date(), stoppedAt: null, breaches: 0, ...o });

test("hides internal metrics and maps at_risk to running", () => {
  const r = toCustomerSla({ applicable: true, metrics: [m({ key: "update" }), m({ key: "resolution", state: "at_risk" })] })!;
  assert.deepEqual(r.metrics.map((x) => x.key), ["resolution"]);
  assert.equal(r.metrics[0].state, "running");
  assert.equal(r.metrics[0].targetMinutes, 60);
});
test("excluded or cancelled tickets expose no SLA at all (no reason leaked)", () => {
  assert.equal(toCustomerSla({ applicable: true, metrics: [m({ state: "excluded" })] }), null);
  assert.equal(toCustomerSla({ applicable: true, metrics: [m({ state: "cancelled" })] }), null);
  assert.equal(toCustomerSla({ applicable: false, metrics: [] }), null);
  assert.equal(toCustomerSla(null), null);
});
test("pauses show a label; third-party reason shown, resolved intervals hidden", () => {
  const r = toCustomerSla({ applicable: true, metrics: [m({ paused: true, pauses: [
    { reason: "waiting_customer", from: new Date("2026-11-04T16:00:00Z"), to: new Date("2026-11-04T17:00:00Z") },
    { reason: "waiting_third_party", from: new Date("2026-11-05T16:00:00Z"), to: null, note: "Proveedor de hosting" },
    { reason: "resolved", from: new Date("2026-11-06T16:00:00Z"), to: new Date("2026-11-07T16:00:00Z") },
  ] })] })!;
  assert.equal(r.metrics[0].pauses.length, 2);
  assert.equal(r.metrics[0].pauses[0].label, "Esperando tu respuesta");
  assert.equal(r.metrics[0].pauses[1].note, "Proveedor de hosting");
  assert.equal(r.metrics[0].paused, true);
});
test("met metric has no due date", () => {
  assert.equal(toCustomerSla({ applicable: true, metrics: [m({ state: "met", stoppedAt: new Date() })] })!.metrics[0].dueAt, null);
});
