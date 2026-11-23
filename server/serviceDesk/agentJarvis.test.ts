// Integration tests (HTTP, real DB) for per-key permissions, visibility, create_ticket and the internal account.
// Runs only with RUN_DB_TESTS=1 AND DB_TEST_ON_BRANCH=1 against a disposable Neon branch (see testSetup.ts).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { and, eq, inArray, like } from "drizzle-orm";

const run = process.env.RUN_DB_TESTS === "1";
let base = "", server: any, db: any, s: any;
const tok: Record<string, string> = {};
const T = { productA: 0, productB: 0, accA: 0, accB: 0, tA: 0, tB: 0, tAkey: "", tBkey: "", keys: [] as number[], plataforma: 0, internalAcc: 0, internalInst: 0 };

async function call(who: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + "/api/v1/agent" + path, { method, headers: { Authorization: `Bearer ${tok[who]}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let b: any = null; try { b = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: r.status, body: b };
}
async function mintKey(name: string, o: { productIds?: number[]; allProducts?: boolean; permissions?: string[] }) {
  const { hashSecret } = await import("./agentAuth");
  const keyId = `qa_${crypto.randomBytes(8).toString("hex")}`, secret = crypto.randomBytes(32).toString("hex");
  const vals: any = { keyId, name, secretHash: hashSecret(secret), productIds: o.productIds ?? [], allProducts: o.allProducts ?? false };
  if (o.permissions) vals.permissions = o.permissions; // omitted => column default (what existing keys get after the migration)
  const [k] = await db.insert(s.sdAgentKeys).values(vals).returning();
  T.keys.push(k.id); tok[name] = `${keyId}.${secret}`; return k;
}
async function mkTicket(accountId: number, productId: number, status = "in_progress") {
  const { createTicket } = await import("./ticketService");
  const t = await createTicket({ accountId, productId, type: "incident", title: "TMPT ticket", channel: "manual", severity: "P3" }, { type: "user", id: 3 }, { notify: false });
  if (status !== "new") await db.update(s.sdTickets).set({ status }).where(eq(s.sdTickets.id, t.id));
  return t;
}
const auditFor = (keyId: number) => db.select().from(s.sdAgentAudit).where(eq(s.sdAgentAudit.keyId, keyId));

before(async () => {
  if (!run) return;
  process.env.SD_ENABLED = "true";
  const express = (await import("express")).default;
  ({ db } = await import("../db")); s = await import("@shared/schema");
  const { ensureServiceDeskSchema } = await import("./migrate"); await ensureServiceDeskSchema();
  const { registerAgentRoutes } = await import("./agentRoutes");
  const { seedProducts, seedInternalAccount } = await import("./jarvisSeed");
  await seedProducts(); const ia = await seedInternalAccount(); T.internalAcc = ia.accountId; T.internalInst = ia.instanceId;
  T.plataforma = (await db.select().from(s.sdProducts).where(eq(s.sdProducts.code, "PLATAFORMAQSS")))[0].id;
  const [pa] = await db.insert(s.sdProducts).values({ code: "TMPT_A", name: "TMPT A" }).returning(); const [pb] = await db.insert(s.sdProducts).values({ code: "TMPT_B", name: "TMPT B" }).returning();
  T.productA = pa.id; T.productB = pb.id;
  for (const [n, p] of [["A", pa.id], ["B", pb.id]] as const) {
    const [c] = await db.insert(s.clientes).values({ codigo: `TMPT-${n}`, tipo: "Cliente", nombreNegocio: `TMPT ${n}` }).returning();
    const [a] = await db.insert(s.sdAccounts).values({ clienteId: c.id, ticketPrefix: `TM${n}` }).returning();
    await db.insert(s.sdInstances).values({ accountId: a.id, productId: p, name: `TMPT ${n}` });
    if (n === "A") T.accA = a.id; else T.accB = a.id;
  }
  const tA = await mkTicket(T.accA, pa.id), tB = await mkTicket(T.accB, pb.id);
  T.tA = tA.id; T.tAkey = tA.key; T.tB = tB.id; T.tBkey = tB.key;
  await mintKey("legacy", { productIds: [pa.id] });                       // default permissions, like the pre-existing key
  await mintKey("limited", { productIds: [pa.id], permissions: [] });
  await mintKey("jarvis", { allProducts: true, permissions: ["create_ticket"] });
  const app = express(); app.use(express.json()); registerAgentRoutes(app, []);
  server = app.listen(0); base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  if (!run) return;
  server?.close();
  const tids = (await db.select({ id: s.sdTickets.id }).from(s.sdTickets).where(inArray(s.sdTickets.accountId, [T.accA, T.accB, T.internalAcc]))).map((x: any) => x.id);
  if (tids.length) { await db.update(s.sdTickets).set({ parentId: null }).where(inArray(s.sdTickets.id, tids)); await db.delete(s.sdTickets).where(inArray(s.sdTickets.id, tids)); }
  if (T.keys.length) { await db.delete(s.sdAgentAudit).where(inArray(s.sdAgentAudit.keyId, T.keys)); await db.delete(s.sdAgentKeys).where(inArray(s.sdAgentKeys.id, T.keys)); }
  await db.delete(s.sdInstances).where(inArray(s.sdInstances.accountId, [T.accA, T.accB]));
  await db.delete(s.sdAccounts).where(inArray(s.sdAccounts.id, [T.accA, T.accB]));
  await db.delete(s.clientes).where(like(s.clientes.codigo, "TMPT-%"));
  await db.delete(s.sdProducts).where(like(s.sdProducts.code, "TMPT_%"));
  const { pool } = await import("../db"); await pool.end();
});

test("visibilidad: una llave con productos explícitos solo ve esos productos y tickets", { skip: !run }, async () => {
  const p = await call("limited", "GET", "/products");
  assert.deepEqual(p.body.map((x: any) => x.code), ["TMPT_A"]);
  assert.equal((await call("limited", "GET", `/tickets/${T.tAkey}`)).status, 200);
  assert.equal((await call("limited", "GET", `/tickets/${T.tBkey}`)).status, 404, "ticket de otro producto no es visible");
  const list = await call("limited", "GET", "/tickets?open=1");
  assert.ok(list.body.every((t: any) => t.productCode === "TMPT_A"));
});

test("all_products: ve todos los productos activos (incluso uno creado después); otras llaves no", { skip: !run }, async () => {
  const before = (await call("jarvis", "GET", "/products")).body.map((x: any) => x.code);
  for (const c of ["INVENTIA", "QNEXUSCONTROL", "PLATAFORMAQSS", "TMPT_A", "TMPT_B"]) assert.ok(before.includes(c) || c.startsWith("QNEXUS") || c === "INVENTIA", c);
  const [late] = await db.insert(s.sdProducts).values({ code: "TMPT_LATE", name: "late" }).returning();
  const after = (await call("jarvis", "GET", "/products")).body.map((x: any) => x.code);
  assert.ok(after.includes("TMPT_LATE"), "un producto nuevo aparece solo en la llave all_products");
  assert.ok(!(await call("legacy", "GET", "/products")).body.some((x: any) => x.code === "TMPT_LATE"), "las demás llaves no cambian");
  assert.equal((await call("jarvis", "GET", `/tickets/${T.tBkey}`)).status, 200);
  await db.delete(s.sdProducts).where(eq(s.sdProducts.id, late.id));
});

test("jarvis NO puede cerrar/rechazar/cancelar/duplicar/resolver (servidor) y queda auditado; sí puede in_progress", { skip: !run }, async () => {
  const jk = T.keys[2];
  for (const to of ["closed", "rejected", "cancelled", "duplicate", "resolved"]) {
    const r = await call("jarvis", "POST", `/tickets/${T.tAkey}/transition`, { to, reason: "prueba" });
    assert.equal(r.status, 403, to);
  }
  const [t] = await db.select().from(s.sdTickets).where(eq(s.sdTickets.id, T.tA));
  assert.equal(t.status, "in_progress", "el estatus no cambió");
  assert.equal((await call("jarvis", "POST", `/tickets/${T.tAkey}/transition`, { to: "waiting_customer", reason: "x" })).status, 200);
  assert.equal((await call("jarvis", "POST", `/tickets/${T.tAkey}/transition`, { to: "in_progress" })).status, 200);
  const rows = await auditFor(jk);
  const denied = rows.filter((r: any) => r.outcome === "denied" && r.action.startsWith("transition:"));
  assert.equal(denied.length, 5, "los 5 intentos rechazados quedan registrados con el id de la llave");
  assert.ok(rows.some((r: any) => r.outcome === "ok" && r.action === "transition:waiting_customer"));
  const ev = await db.select().from(s.sdTicketEvents).where(and(eq(s.sdTicketEvents.ticketId, T.tA), eq(s.sdTicketEvents.kind, "status_changed")));
  assert.ok(ev.some((e: any) => e.actorType === "agent" && e.actorId === jk), "el evento guarda el id de la llave");
});

test("la llave existente (permisos por omisión) conserva su comportamiento: puede resolver y cerrar", { skip: !run }, async () => {
  const t = await mkTicket(T.accA, T.productA);
  assert.equal((await call("legacy", "POST", `/tickets/${t.key}/transition`, { to: "resolved" })).status, 200);
  assert.equal((await call("legacy", "POST", `/tickets/${t.key}/transition`, { to: "closed" })).status, 200);
  const me = await call("legacy", "GET", "/me");
  assert.deepEqual(me.body.permissions.sort(), ["release", "transition_terminal"]);
});

test("llave sin permisos tampoco puede resolver ni cerrar", { skip: !run }, async () => {
  for (const to of ["resolved", "closed"]) assert.equal((await call("limited", "POST", `/tickets/${T.tAkey}/transition`, { to })).status, 403);
});

test("create_ticket: crea en PLATAFORMAQSS con origen transversal, en la cuenta interna, con padre opcional", { skip: !run }, async () => {
  const epic = await call("jarvis", "POST", "/tickets", { product: "PLATAFORMAQSS", origin: "transversal", type: "internal_task", title: "Épica: observabilidad", description: "d" });
  assert.equal(epic.status, 201, JSON.stringify(epic.body));
  const child = await call("jarvis", "POST", "/tickets", { product: "plataformaqss", origin: "negocio", title: "Hijo de la épica", parentId: epic.body.id });
  assert.equal(child.status, 201, JSON.stringify(child.body));
  assert.equal(child.body.parentId, epic.body.id);
  const [row] = await db.select().from(s.sdTickets).where(eq(s.sdTickets.id, child.body.id));
  assert.equal(row.accountId, T.internalAcc); assert.equal(row.origin, "negocio"); assert.equal(row.slaApplicable, false); assert.equal(row.channel, "api");
  const grandchild = await call("jarvis", "POST", "/tickets", { product: "PLATAFORMAQSS", origin: "transversal", title: "Nieto no permitido", parentId: child.body.id });
  assert.equal(grandchild.status, 400);
});

test("create_ticket rechaza productos no permitidos, origen cliente, tipos no permitidos, entradas inválidas y llaves sin permiso", { skip: !run }, async () => {
  const jk = T.keys[2];
  const ok = { product: "PLATAFORMAQSS", origin: "transversal", title: "Titulo valido" };
  assert.equal((await call("jarvis", "POST", "/tickets", { ...ok, product: "TMPT_A" })).status, 403, "otro producto");
  assert.equal((await call("jarvis", "POST", "/tickets", { ...ok, product: "INVENTIA" })).status, 403, "otro producto");
  assert.equal((await call("jarvis", "POST", "/tickets", { ...ok, origin: "cliente" })).status, 403, "origen cliente");
  assert.equal((await call("jarvis", "POST", "/tickets", { ...ok, type: "feature_request" })).status, 400, "tipo no permitido");
  assert.equal((await call("jarvis", "POST", "/tickets", { ...ok, title: "x" })).status, 400, "título corto");
  assert.equal((await call("jarvis", "POST", "/tickets", { ...ok, accountId: T.accA })).status, 400, "campos extra (cuenta de cliente) rechazados");
  assert.equal((await call("jarvis", "POST", "/tickets", { ...ok, parentId: T.tB })).status, 404, "padre de otro producto");
  assert.equal((await call("legacy", "POST", "/tickets", ok)).status, 403, "llave sin permiso create_ticket");
  assert.equal((await call("limited", "POST", "/tickets", ok)).status, 403);
  const denied = (await auditFor(jk)).filter((r: any) => r.action === "create_ticket" && r.outcome !== "ok");
  assert.ok(denied.length >= 7, "los rechazos quedan en la auditoría");
});

test("create_ticket tiene límite de frecuencia por llave", { skip: !run }, async () => {
  const k = await mintKey("jarvis-rate", { allProducts: true, permissions: ["create_ticket"] });
  await db.insert(s.sdAgentAudit).values(Array.from({ length: 20 }, () => ({ keyId: k.id, method: "POST", route: "/api/v1/agent/tickets", action: "create_ticket", status: 201, outcome: "ok" })));
  const r = await call("jarvis-rate", "POST", "/tickets", { product: "PLATAFORMAQSS", origin: "transversal", title: "Uno de más" });
  assert.equal(r.status, 429);
});

test("llave revocada o con secreto inválido: 401 y el intento queda auditado", { skip: !run }, async () => {
  const k = await mintKey("revoked", { productIds: [T.productA] });
  await db.update(s.sdAgentKeys).set({ active: false }).where(eq(s.sdAgentKeys.id, k.id));
  assert.equal((await call("revoked", "GET", "/products")).status, 401);
  const good = tok["revoked"]; tok["badsecret"] = good.split(".")[0] + "." + "0".repeat(64);
  assert.equal((await call("badsecret", "GET", "/products")).status, 401);
  for (let i = 0; i < 20 && (await auditFor(k.id)).length < 2; i++) await new Promise((r) => setTimeout(r, 100)); // audit rows are written without blocking the response
  assert.equal((await auditFor(k.id)).filter((r: any) => r.outcome === "denied").length, 2);
});

test("cuenta interna: no envía correos ni genera SLA, aun con solicitante y cambios de estado", { skip: !run }, async () => {
  const { createTicket, transitionTicket } = await import("./ticketService");
  const { refreshTicketSla, computeForTicket } = await import("./slaService");
  const [contact] = await db.insert(s.sdContacts).values({ accountId: T.internalAcc, email: "interno@qss.test", name: "x" }).returning();
  const emails = async () => (await db.select().from(s.sdEmailLog)).length;
  const n0 = await emails();
  const t = await createTicket({ accountId: T.internalAcc, instanceId: T.internalInst, type: "incident", title: "TMPT interno con solicitante", channel: "api", severity: "P1", requesterContactId: contact.id, origin: "transversal" }, { type: "user", id: 3 });
  await transitionTicket(t.id, "in_progress", { type: "user", id: 3 });
  await new Promise((r) => setTimeout(r, 1500)); // notifications and SLA refresh are fire-and-forget
  const view = await refreshTicketSla(t.id, new Date(), { alert: true });
  assert.equal(await emails(), n0, "ningún correo (cliente ni alertas SLA) salió de la cuenta interna");
  assert.equal(view?.applicable, false); assert.equal(view?.excludedReason, "internal_account"); assert.deepEqual(view?.metrics, []);
  assert.equal((await db.select().from(s.sdSlaInstances).where(eq(s.sdSlaInstances.ticketId, t.id))).length, 0, "sin instancias de SLA");
  assert.equal((await db.select().from(s.sdSlaAlerts).where(eq(s.sdSlaAlerts.ticketId, t.id))).length, 0, "sin alertas de SLA");
  assert.equal((await computeForTicket(t.id))?.excludedReason, "internal_account");
  await db.delete(s.sdContacts).where(eq(s.sdContacts.id, contact.id));
});

test("migración: columnas y valores por omisión esperados", { skip: !run }, async () => {
  const [row] = await db.select().from(s.sdAgentKeys).where(eq(s.sdAgentKeys.id, T.keys[0]));
  assert.equal(row.allProducts, false); assert.deepEqual(row.permissions, ["transition_terminal", "release"]);
  const [acc] = await db.select().from(s.sdAccounts).where(eq(s.sdAccounts.id, T.accA)); assert.equal(acc.internal, false);
  const [t] = await db.select().from(s.sdTickets).where(eq(s.sdTickets.id, T.tA)); assert.equal(t.origin, "cliente"); assert.equal(t.parentId, null);
});
