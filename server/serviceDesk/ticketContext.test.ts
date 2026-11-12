import test from "node:test";
import assert from "node:assert/strict";
import { buildTicketContext } from "../../client/src/pages/admin/desk/ticketContext";

const base = () => ({
  ticket: {
    key: "TRT-0007", title: "No guarda la orden", description: "Al dar guardar no pasa nada", type: "incident", status: "in_progress", severity: "P1",
    perceivedSeverity: "P0", priorityInternal: 2, channel: "widget", environment: "prod", moduleArea: "Órdenes", slaApplicable: true,
    receivedAt: "2026-11-11T10:00:00.000Z", createdAt: "2026-11-11T10:00:00.000Z", updatedAt: "2026-11-11T12:00:00.000Z",
    context: { url: "https://qnexuscontrol.com/app/trt/ordenes/5", userAgent: "Mozilla/5.0 Chrome/130", appVersion: "web", viewport: "1440x900", locale: "es-MX",
      consoleErrors: ["TypeError: Cannot read properties of undefined (reading 'id')\n    at save (orders.js:10:5)", "Failed to fetch /api/orders"], sdkUser: "u-77" },
  },
  requester: { name: "Ana", email: "ana@trt.com" },
  account: { cliente: "TRT Plus", prefix: "TRT" },
  instance: { name: "trt", environment: "prod", baseUrl: "https://qnexuscontrol.com" },
  product: { code: "QNEXUS", name: "QNexusControl" },
  events: [{ kind: "created", at: "2026-11-11T10:00:00.000Z", detail: { channel: "widget" }, actorType: "contact" },
    { kind: "status_changed", at: "2026-11-11T11:00:00.000Z", detail: { from: "new", to: "in_progress" }, actorType: "user" }],
  comments: [
    { visibility: "public", authorType: "user", body: "Ya lo estamos revisando", createdAt: "2026-11-11T11:05:00.000Z" },
    { visibility: "internal", authorType: "user", body: "Parece el módulo de órdenes, revisar commit a1b2c3", createdAt: "2026-11-11T11:10:00.000Z" },
    { visibility: "public", authorType: "contact", body: "Gracias, sigue igual", createdAt: "2026-11-11T11:20:00.000Z" },
  ],
  time: [{ workDate: "2026-11-11", minutes: 45, billable: true, note: "Reproducido" }],
  attachments: [{ id: 5, filename: "captura.png", mime: "image/png", size: 51200, visibility: "public" }, { id: 6, filename: "log.txt", mime: "text/plain", size: 2048, visibility: "internal" }],
});

test("ticket context: everything an engineer (or Claude) needs, in one markdown block", () => {
  const md = buildTicketContext(base());
  for (const piece of [
    "TRT-0007", "No guarda la orden", "TRT Plus", "Incidente", "En progreso", "P1", "widget", "Órdenes",
    "Ana", "ana@trt.com", "QNexusControl", "trt",
    "Al dar guardar no pasa nada",
    "https://qnexuscontrol.com/app/trt/ordenes/5", "Chrome/130", "1440x900", "es-MX",
    "TypeError: Cannot read properties of undefined", "at save (orders.js:10:5)", "Failed to fetch /api/orders",
    "Ya lo estamos revisando", "Gracias, sigue igual", "revisar commit a1b2c3",
    "Nuevo → En progreso", "captura.png", "log.txt", "45 min",
  ]) assert.ok(md.includes(piece), `falta: ${piece}\n${md}`);
  assert.match(md, /```[\s\S]*TypeError[\s\S]*```/); // console errors in a code fence
  assert.match(md, /Nota interna/);
  assert.match(md, /imagen/i); // tells the reader the screenshot travels separately
});

test("ticket context: can leave out internal notes and never prints undefined/null", () => {
  const md = buildTicketContext(base(), { includeInternal: false });
  assert.ok(!md.includes("revisar commit a1b2c3"));
  assert.ok(!md.includes("Nota interna"));
  const bare = buildTicketContext({ ticket: { key: "X-1", title: "t", type: "question", status: "new" }, requester: null, account: null, events: [], comments: [], time: [], attachments: [] } as any);
  assert.ok(bare.includes("X-1"));
  for (const bad of ["undefined", "null", "[object Object]", "NaN"]) assert.ok(!bare.includes(bad), `contiene ${bad}\n${bare}`);
});

test("ticket context: keeps only the latest console errors and caps huge texts", () => {
  const d: any = base();
  d.ticket.context.consoleErrors = Array.from({ length: 50 }, (_, i) => `error ${i}`);
  d.ticket.description = "x".repeat(50_000);
  const md = buildTicketContext(d);
  assert.ok(md.includes("error 49") && !md.includes("error 0\n"));
  assert.ok(md.length < 40_000);
  assert.match(md, /recortad/i);
});
