import test from "node:test";
import assert from "node:assert/strict";
import { docOverdue, docReminder, tasksBlockedByDocs, decisionState, riskLevel, resourceLoad, paymentWarnings, validateDoc, validateRisk, nextCode } from "./projectItemRules";

const H = new Set<string>();
test("documents: overdue only while outstanding; reminders before/after due and escalation", () => {
  assert.equal(docOverdue({ status: "pendiente", dueDate: "2026-11-10" }, "2026-11-11"), true);
  assert.equal(docOverdue({ status: "parcial", dueDate: "2026-11-10" }, "2026-11-11"), true);
  assert.equal(docOverdue({ status: "rechazado", dueDate: "2026-11-10" }, "2026-11-11"), true);
  assert.equal(docOverdue({ status: "recibido", dueDate: "2026-11-10" }, "2026-11-11"), false);
  assert.equal(docOverdue({ status: "validado", dueDate: "2026-11-10" }, "2026-11-11"), false);
  assert.equal(docOverdue({ status: "pendiente", dueDate: "2026-11-11" }, "2026-11-11"), false); // due today is not overdue
  assert.equal(docReminder({ status: "pendiente", dueDate: "2026-11-13" }, "2026-11-11", 3), "before"); // 2 days ahead
  assert.equal(docReminder({ status: "pendiente", dueDate: "2026-11-20" }, "2026-11-11", 3), null);
  assert.equal(docReminder({ status: "pendiente", dueDate: "2026-11-10" }, "2026-11-11", 3), "overdue");
  assert.equal(docReminder({ status: "pendiente", dueDate: "2026-11-05" }, "2026-11-11", 3), "escalate"); // 6 days late
  assert.equal(docReminder({ status: "validado", dueDate: "2026-11-05" }, "2026-11-11", 3), null);
});
test("a task is blocked by the client while an overdue document it needs is outstanding", () => {
  const docs = [{ id: 1, status: "pendiente", dueDate: "2026-11-01" }, { id: 2, status: "recibido", dueDate: "2026-11-01" }, { id: 3, status: "pendiente", dueDate: "2026-12-01" }];
  const tasks = [{ id: 10, docIds: [1], pct: 0 }, { id: 11, docIds: [2], pct: 0 }, { id: 12, docIds: [3], pct: 0 }, { id: 13, docIds: [1], pct: 100 }, { id: 14, docIds: [], pct: 0 }];
  assert.deepEqual(tasksBlockedByDocs(tasks, docs, "2026-11-11"), [10]);
});
test("decisions: open, expired (default applies) and decided", () => {
  assert.equal(decisionState({ status: "open", deadline: "2026-11-20" }, "2026-11-11"), "open");
  assert.equal(decisionState({ status: "open", deadline: "2026-11-10" }, "2026-11-11"), "expired");
  assert.equal(decisionState({ status: "open", deadline: "2026-11-11" }, "2026-11-11"), "open");
  assert.equal(decisionState({ status: "decided", deadline: "2026-11-01" }, "2026-11-11"), "decided");
  assert.equal(decisionState({ status: "defaulted", deadline: "2026-11-01" }, "2026-11-11"), "decided");
});
test("risk level from probability x impact (1..3)", () => {
  assert.equal(riskLevel(1, 1), "low"); assert.equal(riskLevel(2, 1), "low");
  assert.equal(riskLevel(2, 2), "medium"); assert.equal(riskLevel(3, 1), "medium");
  assert.equal(riskLevel(3, 2), "high"); assert.equal(riskLevel(3, 3), "high");
  assert.throws(() => riskLevel(0, 2));
  assert.equal(validateRisk({ title: "x", probability: 4, impact: 1 }).ok, false);
  assert.equal(validateRisk({ title: "Riesgo", probability: 2, impact: 3 }).ok, true);
});
test("resource load spreads hours over business days per ISO week and flags over capacity", () => {
  const r = resourceLoad([
    { assignee: 1, hours: 40, start: "2026-11-09", end: "2026-11-13" }, // 8h/day, Mon-Fri
    { assignee: 1, hours: 20, start: "2026-11-12", end: "2026-11-17" }, // Thu,Fri,Mon,Tue = 5/day
    { assignee: 2, hours: 10, start: "2026-11-09", end: "2026-11-09" },
    { assignee: null, hours: 99, start: "2026-11-09", end: "2026-11-09" },
    { assignee: 1, hours: null, start: "2026-11-09", end: "2026-11-09" },
  ], H, 40);
  const a1 = r.filter((x) => x.assignee === 1);
  assert.deepEqual(a1.map((x) => [x.week, x.hours, x.over]), [["2026-11-09", 50, true], ["2026-11-16", 10, false]]);
  assert.deepEqual(r.filter((x) => x.assignee === 2).map((x) => [x.week, x.hours, x.over]), [["2026-11-09", 10, false]]);
  assert.equal(r.some((x) => x.assignee == null), false);
});
test("payment before its gate is an internal-only informational warning", () => {
  const w = paymentWarnings([{ id: 1, name: "Pago 1", dueDate: "2026-10-12", gateId: 7 }, { id: 2, name: "Pago 2", dueDate: "2026-12-12", gateId: 7 }, { id: 3, name: "Pago 3", dueDate: "2026-10-01", gateId: null }], [{ id: 7, date: "2026-11-03", code: "G1" }]);
  assert.deepEqual(w.map((x) => [x.code, x.paymentId, x.internalOnly]), [["payment_before_gate", 1, true]]);
});
test("document and code validation", () => {
  assert.equal(validateDoc({ name: "Layout de facturas", priority: "A", dueDate: "2026-11-20" }).ok, true);
  assert.equal(validateDoc({ name: "x", priority: "A", dueDate: "2026-11-20" }).ok, false);
  assert.equal(validateDoc({ name: "Layout", priority: "C", dueDate: "2026-11-20" }).ok, false);
  assert.equal(validateDoc({ name: "Layout", priority: "A", dueDate: "mañana" }).ok, false);
  assert.equal(nextCode("DOC", ["DOC-01", "DOC-07", "DOC-3", "X-9"]), "DOC-08");
  assert.equal(nextCode("P", []), "P-01");
});
