import test from "node:test";
import assert from "node:assert/strict";
import { validateQuote, quoteState, canRelease, validateUatDecision, hoursBankStatus, bankAlertsToSend } from "./featureRules";

const now = new Date("2026-11-10T12:00:00Z");
const q = (o: object = {}) => ({ scope: "Agregar exportación a Excel del reporte de órdenes", hours: 20, cost: 18000, currency: "MXN", assumptions: "Datos ya disponibles", validUntil: "2026-12-10", outOfContract: true, ...o });

test("quote validation", () => {
  assert.equal(validateQuote(q(), now).ok, true);
  assert.equal(validateQuote(q({ scope: "corto" }), now).ok, false);
  assert.equal(validateQuote(q({ hours: 0 }), now).ok, false);
  assert.equal(validateQuote(q({ hours: 6000 }), now).ok, false);
  assert.equal(validateQuote(q({ cost: -1 }), now).ok, false);
  assert.equal(validateQuote(q({ validUntil: "2026-11-01" }), now).ok, false);
  assert.equal(validateQuote(q({ validUntil: "no-fecha" }), now).ok, false);
  assert.equal(validateQuote(q({ currency: "EUR" }), now).ok, false);
});
test("quote state: expired only when sent and past validity; approved/rejected are final", () => {
  assert.equal(quoteState({ status: "sent", validUntil: "2026-12-10" }, now), "sent");
  assert.equal(quoteState({ status: "sent", validUntil: "2026-11-09" }, now), "expired");
  assert.equal(quoteState({ status: "sent", validUntil: "2026-11-10" }, now), "sent"); // valid through the whole day
  assert.equal(quoteState({ status: "approved", validUntil: "2020-01-01" }, now), "approved");
  assert.equal(quoteState({ status: "draft", validUntil: "2020-01-01" }, now), "draft");
});
test("release requires UAT items, all Go", () => {
  assert.equal(canRelease([]).ok, false);
  assert.equal(canRelease([{ status: "go" }, { status: "pending" }]).ok, false);
  assert.equal(canRelease([{ status: "go" }, { status: "no_go" }]).ok, false);
  assert.equal(canRelease([{ status: "go" }, { status: "go" }]).ok, true);
});
test("UAT decision: No Go needs a comment", () => {
  assert.equal(validateUatDecision("go", "").ok, true);
  assert.equal(validateUatDecision("no_go", "  ").ok, false);
  assert.equal(validateUatDecision("no_go", "Falla al exportar").ok, true);
  assert.equal(validateUatDecision("maybe" as any, "x").ok, false);
});
test("hours bank status and alert thresholds (80%, 100%)", () => {
  assert.deepEqual(hoursBankStatus(null, 5), { pct: null, level: "none", balance: null });
  assert.deepEqual(hoursBankStatus(15, 6), { pct: 40, level: "ok", balance: 9 });
  assert.equal(hoursBankStatus(15, 12).level, "warn");
  assert.equal(hoursBankStatus(15, 15).level, "over");
  assert.equal(hoursBankStatus(15, 18).balance, -3);
  assert.deepEqual(bankAlertsToSend(40, []), []);
  assert.deepEqual(bankAlertsToSend(85, []), [80]);
  assert.deepEqual(bankAlertsToSend(120, []), [80, 100]);
  assert.deepEqual(bankAlertsToSend(120, [80]), [100]);
  assert.deepEqual(bankAlertsToSend(120, [80, 100]), []);
});
