import test from "node:test";
import assert from "node:assert/strict";
import { scheduleCsv, validateChange, changeNext, lastCutDate, buildCut, renderCutHtml, parseScheduleCsv } from "./projectP2bRules";

test("change request: validation and the only allowed transitions", () => {
  assert.equal(validateChange({ title: "Reporte nuevo", hoursImpact: 40, costImpact: 20000, daysImpact: 5 }).ok, true);
  assert.equal(validateChange({ title: "x", hoursImpact: 1, costImpact: 1, daysImpact: 1 }).ok, false);
  assert.equal(validateChange({ title: "Reporte nuevo", hoursImpact: -1, costImpact: 0, daysImpact: 0 }).ok, false);
  assert.equal(validateChange({ title: "Reporte nuevo", hoursImpact: 1, costImpact: 0, daysImpact: 1.5 }).ok, false);
  assert.equal(changeNext("draft", "propose"), "proposed");
  assert.equal(changeNext("proposed", "approve"), "approved");
  assert.equal(changeNext("proposed", "reject"), "rejected");
  assert.equal(changeNext("approved", "apply"), "applied");
  assert.equal(changeNext("draft", "approve"), null); // the customer cannot approve what was never proposed
  assert.equal(changeNext("rejected", "approve"), null);
  assert.equal(changeNext("applied", "reject"), null);
});
test("cut date: most recent configured weekday on or before today (idempotency key)", () => {
  assert.equal(lastCutDate("2026-11-13", 5), "2026-11-13"); // Friday
  assert.equal(lastCutDate("2026-11-16", 5), "2026-11-13"); // Monday -> previous Friday
  assert.equal(lastCutDate("2026-11-12", 5), "2026-11-06");
  assert.equal(lastCutDate("2026-11-15", 1), "2026-11-09"); // Sunday -> Monday
});
test("status cut is customer-safe and carries the key sections", () => {
  const cut = buildCut({
    asOf: "2026-11-13", project: { name: "Frygo TMS", status: "planning" },
    progress: { actual: 42.5, planned: 50, status: "at_risk" },
    gates: [{ code: "G1", name: "Diseño", date: "2026-11-20", status: "open" }, { code: "G0", name: "Arranque", date: "2026-11-01", status: "signed" }, { code: "G2", name: "Config", date: "2027-03-01", status: "open" }],
    blocked: [{ code: "1.1", name: "Diseño de la solución" }],
    docsOverdue: [{ code: "DOC-01", name: "Layout", dueDate: "2026-11-01" }],
    decisions: [{ code: "P-01", question: "¿Folio?", deadline: "2026-11-05", state: "expired", defaultDecision: "A" }, { code: "P-02", question: "¿Moneda?", deadline: "2099-01-01", state: "open", defaultDecision: "MXN" }],
    risks: [{ code: "R-02", title: "Proveedor", level: "low" }],
    payments: [{ name: "Pago 1", dueDate: "2026-11-30", status: "pending", amount: "1000", currency: "MXN" }],
  });
  assert.equal(cut.progress.actual, 42.5);
  assert.deepEqual(cut.nextGates.map((g) => g.code), ["G1"]); // unsigned and within the next 45 days, nearest first
  assert.equal(cut.decisionsPending.length, 2); assert.equal(cut.decisionsPending[0].expired, true);
  const html = renderCutHtml(cut, { logoUrl: "https://x/logo.png", portalUrl: "https://x/portal" });
  for (const s of ["Frygo TMS", "42.5", "En riesgo", "G1", "DOC-01", "P-01", "R-02", "Pago 1"]) assert.ok(html.includes(s), s);
  assert.ok(!html.includes("<script"));
  assert.ok(renderCutHtml({ ...cut, project: { name: "<script>alert(1)</script>" } }, { logoUrl: "", portalUrl: "" }).includes("&lt;script&gt;"));
});
test("schedule importer: sections, business-day durations, refs, and honest errors", () => {
  const csv = [
    "tipo,codigo,nombre,fase,responsable,inicio,fin,avance,notas,monto,fecha",
    "FASE,F0,Descubrimiento,,,,,,,,",
    "TAREA,0.1,Levantamiento,F0,Ana,2026-11-09,2026-11-13,100,Ver DOC-01 y P-02,,",
    "TAREA,0.2,Entrega de documentos,F0,Cliente,2026-11-16,2026-11-17,0,riesgo R-01 y MOD-03,,",
    "TAREA,0.3,Sin fechas,F0,Ana,,,0,,,",
    "TAREA,0.4,Fase inexistente,F9,Ana,2026-11-18,2026-11-18,0,,,",
    "TAREA,0.5,Fin antes de inicio,F0,Ana,2026-11-20,2026-11-18,0,,,",
    "PAGO,,Anticipo,,,,,,,50000,2026-10-12",
    "PAGO,,Sin monto,,,,,,,abc,2026-10-12",
    "FERIADO,,Puente,,,2026-11-27,,,,,",
    "OTRO,,Raro,,,,,,,,",
  ].join("\n");
  const r = parseScheduleCsv(csv, new Set<string>(["2026-11-16"])); // Monday 16-Nov is a holiday
  assert.deepEqual(r.phases.map((p) => p.code), ["F0"]);
  assert.equal(r.tasks.length, 2);
  assert.deepEqual([r.tasks[0].days, r.tasks[0].pct, r.tasks[0].clientSide], [5, 100, false]);
  assert.deepEqual([r.tasks[1].days, r.tasks[1].clientSide], [1, true]); // 16th is a holiday: only the 17th counts; "Cliente" owns it
  assert.deepEqual(r.tasks[0].refs, { doc: ["DOC-01"], decision: ["P-02"], risk: [], module: [] });
  assert.deepEqual(r.tasks[1].refs, { doc: [], decision: [], risk: ["R-01"], module: ["MOD-03"] });
  assert.equal(r.payments.length, 1); assert.equal(r.payments[0].amount, 50000);
  assert.deepEqual(r.holidays, ["2026-11-27"]);
  const msgs = r.errors.map((e) => e.line + ":" + e.message.slice(0, 12));
  assert.equal(r.errors.length, 5, msgs.join(" | "));
  assert.deepEqual(r.errors.map((e) => e.line).sort((a, b) => a - b), [5, 6, 7, 9, 11]);
  assert.equal(parseScheduleCsv("", new Set()).errors.length, 1);
  assert.equal(parseScheduleCsv("a,b\n1,2", new Set()).errors[0].message.includes("columna"), true);
});
test("schedule CSV export: client view hides hours; formulas are neutralised", () => {
  const v = { phases: [{ id: 1, name: "Diseño" }], tasks: [{ code: "1.1", name: "=HYPERLINK(\"x\")", phaseId: 1, owner: "qss", start: "2026-11-09", end: "2026-11-13", pct: 50, days: 5, hours: 40, clientSide: false, assigneeUserId: 3 }] };
  const c = scheduleCsv(v, true), i = scheduleCsv(v, false);
  assert.ok(!c.includes("Horas") && !c.includes("40") && c.includes("QSS"));
  assert.ok(i.includes("Horas") && i.includes('"40"'));
  assert.ok(c.includes('"\'=HYPERLINK'));
});
