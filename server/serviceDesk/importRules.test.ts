import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, mapStatus, mapSeverity, parseDate, suggestMapping, buildImportRows } from "./importRules";

test("parseCsv handles BOM, semicolons, quotes, embedded newlines and commas", () => {
  const r = parseCsv('﻿ID;Título;Estado\r\n1;"Hola; mundo";Abierto\r\n2;"Línea 1\nLínea 2";"Cerrado"\r\n');
  assert.deepEqual(r.headers, ["ID", "Título", "Estado"]);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0]["Título"], "Hola; mundo");
  assert.equal(r.rows[1]["Título"], "Línea 1\nLínea 2");
  assert.equal(parseCsv('a,b\n1,"x ""q"" y"\n').rows[0].b, 'x "q" y');
});
test("parseCsv skips blank lines and trims headers", () => {
  const r = parseCsv(" a , b \n\n1,2\n,\n");
  assert.deepEqual(r.headers, ["a", "b"]);
  assert.equal(r.rows.length, 1);
});
test("status mapping to the unified machine (es/en, accents, case)", () => {
  assert.equal(mapStatus("Abierto"), "new");
  assert.equal(mapStatus("EN PROCESO"), "in_progress");
  assert.equal(mapStatus("En desarrollo"), "in_progress");
  assert.equal(mapStatus("Esperando cliente"), "waiting_customer");
  assert.equal(mapStatus("Resuelto"), "resolved");
  assert.equal(mapStatus("Cerrado"), "closed");
  assert.equal(mapStatus("Done"), "closed");
  assert.equal(mapStatus("Cancelado"), "cancelled");
  assert.equal(mapStatus("algo raro"), null);
  assert.equal(mapStatus(""), null);
});
test("severity mapping: P0..P3, 'crítico' words", () => {
  assert.equal(mapSeverity("P0"), "P0");
  assert.equal(mapSeverity("p2 "), "P2");
  assert.equal(mapSeverity("Crítica"), "P1"); // never auto-assign P0 (needs the questionnaire)
  assert.equal(mapSeverity("Alta"), "P1");
  assert.equal(mapSeverity("Media"), "P2");
  assert.equal(mapSeverity("Baja"), "P3");
  assert.equal(mapSeverity("zzz"), null);
});
test("imported P0 label is kept as P0 only in perceived severity, not severity", () => {
  const { rows } = buildImportRows([{ t: "Caída", sev: "P0", e: "Abierto" }], { title: "t", severity: "sev", status: "e" });
  assert.equal(rows[0].severity, null);
  assert.equal(rows[0].perceivedSeverity, "P0");
});
test("parseDate: ISO, dd/mm/yyyy, with time, excel-like; Mexico City offset", () => {
  assert.equal(parseDate("2026-03-05T10:00:00Z")!.toISOString(), "2026-03-05T10:00:00.000Z");
  assert.equal(parseDate("05/03/2026")!.toISOString(), "2026-03-05T06:00:00.000Z");
  assert.equal(parseDate("05/03/2026 14:30")!.toISOString(), "2026-03-05T20:30:00.000Z");
  assert.equal(parseDate("2026-03-05 09:15")!.toISOString(), "2026-03-05T15:15:00.000Z");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("ayer"), null);
  assert.equal(parseDate(""), null);
});
test("suggestMapping guesses columns from Spanish/English headers", () => {
  const m = suggestMapping(["Folio", "Asunto", "Descripción", "Prioridad", "Estatus", "Fecha de reporte", "Fecha de resolución", "Horas", "Solicitante"]);
  assert.deepEqual(m, { externalRef: "Folio", title: "Asunto", description: "Descripción", severity: "Prioridad", status: "Estatus", createdAt: "Fecha de reporte", resolvedAt: "Fecha de resolución", hours: "Horas", requester: "Solicitante" });
});
test("buildImportRows flags data quality and never throws", () => {
  const recs = [
    { id: "1", t: "Falla login", e: "Cerrado", c: "05/03/2026 10:00", r: "06/03/2026 10:00" },
    { id: "2", t: "", e: "???", c: "", r: "" },
    { id: "3", t: "Sin cierre", e: "Cerrado", c: "05/03/2026", r: "" },
    { id: "4", t: "Fechas invertidas", e: "Resuelto", c: "07/03/2026", r: "01/03/2026" },
  ];
  const { rows, summary } = buildImportRows(recs, { externalRef: "id", title: "t", status: "e", createdAt: "c", resolvedAt: "r" });
  assert.equal(rows[0].status, "closed");
  assert.deepEqual(rows[0].flags, []);
  assert.equal(rows[1].skip, "Sin título");
  assert.ok(rows[2].flags.includes("missing_resolved_at"));
  assert.ok(rows[3].flags.includes("resolved_before_created"));
  assert.equal(summary.total, 4); assert.equal(summary.importable, 3); assert.equal(summary.skipped, 1);
});
test("unknown status falls back to 'new' with a flag; closed rows get a closedAt", () => {
  const { rows } = buildImportRows([{ t: "x y z", e: "rarísimo", c: "05/03/2026" }], { title: "t", status: "e", createdAt: "c" });
  assert.equal(rows[0].status, "new");
  assert.ok(rows[0].flags.includes("unknown_status"));
  assert.ok(rows[0].flags.includes("missing_created_at") === false);
});
test("duplicate external refs inside the file are skipped", () => {
  const { rows } = buildImportRows([{ id: "A", t: "uno dos" }, { id: "A", t: "tres cuatro" }], { externalRef: "id", title: "t" });
  assert.equal(rows[1].skip, "Folio repetido en el archivo");
});
