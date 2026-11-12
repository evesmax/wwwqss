// Integration test over HTTP against the real DB. Runs only with RUN_DB_TESTS=1.
// Creates temp rows (codes prefixed TMPT) and removes them afterwards. It CANNOT
// remove the audit rows it produces (sd_audit_log is append-only by design), so
// each run leaves a handful of audit rows for deleted temp users: run it sparingly.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

const run = process.env.RUN_DB_TESTS === "1";
const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

let base = "";
let server: any;
const ids = { users: [] as number[], clientes: [] as number[], accounts: [] as number[], product: 0 };
const jars: Record<string, string> = {};
let prevSmtp: any = null;
let prevTick: any = null;
let accA = 0, accB = 0;
const contactIds: Record<string, number> = {};
const TEST_EMAILS = ["c1@a.test", "c2@a.test", "adm@a.test", "cb@b.test"];

async function api(who: string, method: string, path: string, body?: unknown) {
  const t0 = Date.now(); if (process.env.TRACE_API) console.error(">>", method, path);
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: jars[who] ?? "" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (process.env.TRACE_API) console.error("<<", r.status, Date.now() - t0, "ms");
  let parsed: any = null; try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON body (CSV export) */ }
  return { status: r.status, body: parsed, raw: text };
}

async function login(who: string, username: string) {
  const { generateSync } = await import("otplib");
  const grab = (r: Response) => { const c = r.headers.getSetCookie()[0]; if (c) jars[who] = c.split(";")[0]; };
  let r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: "pw-test-12345" }) });
  grab(r);
  r = await fetch(base + "/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json", cookie: jars[who] }, body: JSON.stringify({ token: generateSync({ secret: SECRET }) }) });
  grab(r);
  assert.equal(r.status, 200, `login ${who}: ${await r.clone().text()}`);
}

before(async () => {
  if (!run) return;
  process.env.SD_ENABLED = "true";
  process.env.SESSION_SECRET ||= "test-session-secret";
  const express = (await import("express")).default;
  const { createServer } = await import("http");
  void createServer;
  const { registerRoutes } = await import("../routes");
  const { db } = await import("../db");
  const s = await import("@shared/schema");
  const { hashPassword } = await import("../auth");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  server = await registerRoutes(app);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${server.address().port}`;

  const [prev] = await db.select().from(s.sdSettings).where(eq(s.sdSettings.key, "smtp"));
  prevSmtp = prev ?? null;
  const [pt] = await db.select().from(s.sdSettings).where(eq(s.sdSettings.key, "sla.tickTokenHash"));
  prevTick = pt ?? null;

  const mkUser = async (username: string) => {
    const [u] = await db.insert(s.users).values({ username, password: hashPassword("pw-test-12345"), email: `${username}@t.test`, active: true, totpEnabled: true, totpSecret: SECRET }).returning();
    ids.users.push(u.id); return u.id;
  };
  const stamp = Date.now().toString(36).toUpperCase();
  const mkAccount = async (tag: string, prefix: string) => {
    const [c] = await db.insert(s.clientes).values({ codigo: `TMPT-${tag}-${stamp}`, tipo: "Cliente", nombreNegocio: `TMPT ${tag}` }).returning();
    ids.clientes.push(c.id);
    const [a] = await db.insert(s.sdAccounts).values({ clienteId: c.id, accountType: "suscripcion", ticketPrefix: prefix }).returning();
    ids.accounts.push(a.id); return a.id;
  };
  const [p] = await db.insert(s.sdProducts).values({ code: `TMPT-P-${stamp}`, name: "TMPT product" }).returning();
  ids.product = p.id;
  accA = await mkAccount("A", `TA${stamp.slice(-3)}`.slice(0, 6).replace(/[^A-Z]/g, "X"));
  accB = await mkAccount("B", `TB${stamp.slice(-3)}`.slice(0, 6).replace(/[^A-Z]/g, "Y"));
  await db.insert(s.sdContacts).values({ accountId: accB, email: "secret-b@client.test", name: "Contacto B" });

  const owner = await mkUser(`tmpt_owner_${stamp}`);
  const agentA = await mkUser(`tmpt_agenta_${stamp}`);
  const l1 = await mkUser(`tmpt_l1_${stamp}`);
  const nobody = await mkUser(`tmpt_nobody_${stamp}`);
  await db.insert(s.sdRoleAssignments).values([
    { userId: owner, role: "owner", scopeType: "global" },
    { userId: agentA, role: "agent_l2", scopeType: "account", scopeId: accA },
    { userId: l1, role: "agent_l1", scopeType: "global" },
  ]);
  await db.insert(s.sdContracts).values([{ accountId: accA, productId: p.id }, { accountId: accB, productId: p.id }]);
  const mkContact = async (key: string, accountId: number, email: string, role: string) => {
    const [c] = await db.insert(s.sdContacts).values({ accountId, email, name: key, role }).returning();
    contactIds[key] = c.id;
  };
  await mkContact("c1", accA, "c1@a.test", "contact");
  await mkContact("c2", accA, "c2@a.test", "contact");
  await mkContact("adm", accA, "adm@a.test", "account_admin");
  await mkContact("cb", accB, "cb@b.test", "contact");
  await login("owner", `tmpt_owner_${stamp}`);
  await login("agentA", `tmpt_agenta_${stamp}`);
  await login("l1", `tmpt_l1_${stamp}`);
  await login("nobody", `tmpt_nobody_${stamp}`);
});

after(async () => {
  if (!run) return;
  const { db } = await import("../db");
  const s = await import("@shared/schema");
  server?.close();
  await db.delete(s.sdSettings).where(eq(s.sdSettings.key, "smtp"));
  if (prevSmtp) await db.insert(s.sdSettings).values(prevSmtp);
  await db.delete(s.sdSettings).where(eq(s.sdSettings.key, "sla.tickTokenHash"));
  if (prevTick) await db.insert(s.sdSettings).values(prevTick);
  if (ids.users.length) await db.delete(s.sdSlaChanges).where(inArray(s.sdSlaChanges.userId, ids.users));
  if (ids.accounts.length) await db.delete(s.sdProjects).where(inArray(s.sdProjects.accountId, ids.accounts));
  if (ids.product) await db.delete(s.sdFeatures).where(eq(s.sdFeatures.productId, ids.product));
  if (ids.accounts.length) await db.delete(s.sdTickets).where(inArray(s.sdTickets.accountId, ids.accounts));
  await db.delete(s.sdPortalTokens).where(inArray(s.sdPortalTokens.email, TEST_EMAILS));
  await db.delete(s.sdEmailLog).where(inArray(s.sdEmailLog.toAddress, TEST_EMAILS));
  if (ids.accounts.length) await db.delete(s.sdAccounts).where(inArray(s.sdAccounts.id, ids.accounts));
  if (ids.clientes.length) await db.delete(s.clientes).where(inArray(s.clientes.id, ids.clientes));
  if (ids.product) await db.delete(s.sdPlatformIncidents).where(eq(s.sdPlatformIncidents.productId, ids.product));
  if (ids.product) await db.delete(s.sdMaintenance).where(eq(s.sdMaintenance.productId, ids.product));
  if (ids.product) await db.delete(s.sdSdkKeys).where(eq(s.sdSdkKeys.productId, ids.product));
  if (ids.product) await db.delete(s.sdProducts).where(eq(s.sdProducts.id, ids.product));
  if (ids.users.length) {
    await db.delete(s.users).where(inArray(s.users.id, ids.users));
  }
  const { pool } = await import("../db");
  await pool.end();
});

test("agent scoped to account A sees A, not B, and gets 404 on B", { skip: !run }, async () => {
  const list = await api("agentA", "GET", "/api/desk/accounts");
  assert.deepEqual(list.body.map((a: any) => a.id), [accA]);
  assert.equal((await api("agentA", "GET", `/api/desk/contacts?accountId=${accB}`)).status, 404);
  assert.equal((await api("agentA", "GET", `/api/desk/contacts?accountId=${accA}`)).status, 200);
  assert.ok(!(await api("agentA", "GET", "/api/desk/accounts")).raw.includes("secret-b"));
});

test("user without assignments sees nothing", { skip: !run }, async () => {
  assert.deepEqual((await api("nobody", "GET", "/api/desk/accounts")).body, []);
  assert.deepEqual((await api("nobody", "GET", "/api/desk/products")).body, []);
  assert.equal((await api("nobody", "POST", "/api/desk/products", { code: "X", name: "X" })).status, 403);
});

test("agent_l1 cannot write; owner can", { skip: !run }, async () => {
  assert.equal((await api("l1", "PUT", `/api/desk/accounts/${accA}`, { clienteId: 1, accountType: "demo", ticketPrefix: "ZZ" })).status, 403);
  const ok = await api("owner", "PUT", `/api/desk/accounts/${accA}`, { clienteId: 1, accountType: "demo", ticketPrefix: "TMPA" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.accountType, "demo");
});

test("SMTP: owner only, password never returned, empty password keeps stored one", { skip: !run }, async (t) => {
  if (prevSmtp) return t.skip("a real SMTP config exists; not touching it");
  const cfg = { host: "smtp.test", port: 587, secure: false, user: "u", password: "TOP-SECRET-PW", fromName: "QSS", fromEmail: "soporte@test.dev" };
  assert.equal((await api("l1", "PUT", "/api/desk/settings/smtp", cfg)).status, 403);
  const put = await api("owner", "PUT", "/api/desk/settings/smtp", cfg);
  assert.equal(put.status, 200);
  assert.ok(!put.raw.includes("TOP-SECRET-PW"));
  assert.equal(put.body.hasPassword, true);
  const { password: _p, ...noPw } = cfg;
  await api("owner", "PUT", "/api/desk/settings/smtp", { ...noPw, host: "smtp2.test" });
  const get = await api("owner", "GET", "/api/desk/settings/smtp");
  assert.ok(!get.raw.includes("TOP-SECRET-PW"));
  assert.equal(get.body.hasPassword, true);
  assert.equal(get.body.host, "smtp2.test");
  const { getSmtpConfig } = await import("./settings");
  assert.equal((await getSmtpConfig())!.password, "TOP-SECRET-PW");
  const { db } = await import("../db");
  const { sdAuditLog } = await import("@shared/schema");
  const rows = await db.select().from(sdAuditLog).where(eq(sdAuditLog.action, "smtp.updated"));
  assert.ok(!JSON.stringify(rows).includes("TOP-SECRET-PW"));
});

test("owner cannot remove own owner role; assignments validated", { skip: !run }, async () => {
  const me = (await api("owner", "GET", "/api/desk/users")).body.find((u: any) => u.assignments.some((a: any) => a.role === "owner" && a.scopeType === "global" && u.username.startsWith("tmpt_owner_")));
  const r = await api("owner", "PUT", `/api/desk/users/${me.id}/assignments`, { assignments: [{ role: "readonly", scopeType: "global", scopeId: null }] });
  assert.equal(r.status, 400);
  const bad = await api("owner", "PUT", `/api/desk/users/${me.id}/assignments`, { assignments: [{ role: "owner", scopeType: "account", scopeId: null }] });
  assert.equal(bad.status, 400);
});

test("user with a role but no MFA is refused", { skip: !run }, async () => {
  const { db } = await import("../db");
  const { users } = await import("@shared/schema");
  await db.update(users).set({ totpEnabled: false }).where(eq(users.id, ids.users[2]));
  const r = await api("l1", "GET", "/api/desk/accounts");
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "mfa_required");
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, ids.users[2]));
});

test("admin user endpoints never return password hash or TOTP secret", { skip: !run }, async () => {
  const target = ids.users[3]; // temp 'nobody' user, has totpSecret
  const r = await api("owner", "PUT", `/api/admin/users/${target}`, { fullName: "Temp Nobody", active: true });
  assert.equal(r.status, 200);
  assert.ok(!("password" in r.body) && !("totpSecret" in r.body));
  assert.ok(!r.raw.includes(SECRET));
});


// ───────── H1: tickets + portal ─────────
async function portalLogin(who: string, email: string) {
  const { db } = await import("../db");
  const { sdPortalTokens } = await import("@shared/schema");
  const { hashToken } = await import("./portalAuth");
  const token = `tok-${who}-${Math.random().toString(36).slice(2)}-${"x".repeat(20)}`;
  await db.insert(sdPortalTokens).values({ email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
  const r = await fetch(base + "/api/portal/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  assert.equal(r.status, 200);
  jars[who] = r.headers.getSetCookie()[0].split(";")[0];
  return token;
}
const papi = (who: string, method: string, path: string, body?: unknown) => api(who, method, path, body);

test("tickets: scoped agent creates in own account only; keys are sequential and unique under concurrency", { skip: !run }, async () => {
  const mk = () => api("agentA", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "Pregunta concurrente", channel: "manual" });
  const rs = await Promise.all([mk(), mk(), mk(), mk(), mk()]);
  assert.ok(rs.every((r) => r.status === 201), JSON.stringify(rs.map((r) => r.body)));
  const keys = rs.map((r) => r.body.key);
  assert.equal(new Set(keys).size, 5);
  assert.equal((await api("agentA", "POST", "/api/desk/tickets", { accountId: accB, type: "question", title: "No debe", channel: "manual" })).status, 404);
  assert.equal((await api("l1", "POST", "/api/desk/tickets", { accountId: accB, type: "question", title: "L1 global ok", channel: "manual" })).status, 201);
});

test("tickets: severity and transition rules enforced by API", { skip: !run }, async () => {
  assert.equal((await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "Con severidad", severity: "P1" })).status, 400);
  assert.equal((await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "incident", title: "P0 sin cuestionario", severity: "P0" })).status, 400);
  const t = await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "incident", title: "Caída parcial", severity: "P1" });
  assert.equal(t.status, 201);
  assert.equal(t.body.status, "new");
  const id = t.body.id;
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${id}/transition`, { to: "closed" })).status, 400);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${id}/transition`, { to: "in_progress" })).status, 200);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${id}/transition`, { to: "resolved" })).status, 400, "P1 needs RCA");
  const rca = { cause: "bug", fix: "patch", prevention: "test", kind: "code" };
  const ok = await api("owner", "POST", `/api/desk/tickets/${id}/transition`, { to: "resolved", rca });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.resolvedAt);
  const d = await api("owner", "GET", `/api/desk/tickets/${id}`);
  assert.deepEqual(d.body.events.map((e: any) => e.kind), ["created", "status_changed", "status_changed"]);
});

test("tickets: first response only from a public human comment, not the auto-ack", { skip: !run }, async () => {
  const t = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "service_request", title: "Alta de usuario", requesterContactId: contactIds.c1 })).body;
  assert.equal(t.firstResponseAt, null);
  await api("owner", "POST", `/api/desk/tickets/${t.id}/comments`, { body: "nota interna", visibility: "internal" });
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${t.id}`)).body.ticket.firstResponseAt, null);
  await api("owner", "POST", `/api/desk/tickets/${t.id}/comments`, { body: "respuesta al cliente", visibility: "public" });
  assert.ok((await api("owner", "GET", `/api/desk/tickets/${t.id}`)).body.ticket.firstResponseAt);
});

test("tickets: agent_l1/time entry validation", { skip: !run }, async () => {
  const t = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "Horas" })).body;
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${t.id}/time`, { minutes: 0, workDate: "2026-11-08" })).status, 400);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${t.id}/time`, { minutes: 90, workDate: "2026-11-08" })).status, 201);
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${t.id}`)).body.totalMinutes, 90);
  assert.equal((await api("nobody", "POST", `/api/desk/tickets/${t.id}/time`, { minutes: 5, workDate: "2026-11-08" })).status, 403);
});

test("portal: magic token is single use and unauthenticated access is refused", { skip: !run }, async () => {
  assert.equal((await papi("anon", "GET", "/api/portal/tickets")).status, 401);
  const token = await portalLogin("c1", "c1@a.test");
  const again = await fetch(base + "/api/portal/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  assert.equal(again.status, 401);
  const unknown = await fetch(base + "/api/portal/auth/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nadie@nowhere.test" }) });
  assert.equal(unknown.status, 200);
  const { db } = await import("../db");
  const { sdPortalTokens } = await import("@shared/schema");
  const expired = `exp-${"y".repeat(30)}`;
  const { hashToken } = await import("./portalAuth");
  await db.insert(sdPortalTokens).values({ email: "c1@a.test", tokenHash: hashToken(expired), expiresAt: new Date(Date.now() - 1000) });
  const ex = await fetch(base + "/api/portal/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: expired }) });
  assert.equal(ex.status, 401);
});

test("portal: contacts only see their own / shared / (admin) account tickets, never internal notes or other accounts", { skip: !run }, async () => {
  await portalLogin("c1", "c1@a.test"); await portalLogin("c2", "c2@a.test"); await portalLogin("adm", "adm@a.test"); await portalLogin("cb", "cb@b.test");
  const created = await papi("c1", "POST", "/api/portal/tickets", { accountId: accA, type: "incident", title: "No carga el reporte", description: "detalle", perceivedSeverity: "P0" });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const d = (await api("owner", "GET", `/api/desk/tickets/${id}`)).body;
  assert.equal(d.ticket.severity, null, "customer cannot set real severity");
  assert.equal(d.ticket.perceivedSeverity, "P0");
  assert.equal(d.ticket.channel, "portal");
  await api("owner", "POST", `/api/desk/tickets/${id}/comments`, { body: "SECRETO-INTERNO", visibility: "internal" });
  await api("owner", "POST", `/api/desk/tickets/${id}/comments`, { body: "hola cliente", visibility: "public" });
  const mine = await papi("c1", "GET", `/api/portal/tickets/${id}`);
  assert.equal(mine.status, 200);
  assert.ok(!mine.raw.includes("SECRETO-INTERNO"));
  assert.ok(mine.raw.includes("hola cliente"));
  assert.equal((await papi("c2", "GET", `/api/portal/tickets/${id}`)).status, 404);
  assert.ok(!(await papi("c2", "GET", "/api/portal/tickets")).body.some((t: any) => t.id === id));
  assert.equal((await papi("adm", "GET", `/api/portal/tickets/${id}`)).status, 200);
  assert.equal((await papi("cb", "GET", `/api/portal/tickets/${id}`)).status, 404);
  assert.equal((await papi("cb", "POST", `/api/portal/tickets/${id}/comments`, { body: "intruso" })).status, 404);
  assert.equal((await papi("cb", "POST", "/api/portal/tickets", { accountId: accA, type: "question", title: "En otra cuenta" })).status, 404);
  await api("owner", "PATCH", `/api/desk/tickets/${id}`, { sharedWithAccount: true });
  assert.equal((await papi("c2", "GET", `/api/portal/tickets/${id}`)).status, 200);
  assert.equal((await papi("cb", "GET", `/api/portal/tickets/${id}`)).status, 404);
});

test("portal: customer reply resumes a waiting_customer ticket", { skip: !run }, async () => {
  await portalLogin("c1", "c1@a.test");
  const id = (await papi("c1", "POST", "/api/portal/tickets", { accountId: accA, type: "question", title: "¿Cómo exporto?" })).body.id;
  await api("owner", "POST", `/api/desk/tickets/${id}/transition`, { to: "triage" });
  await api("owner", "POST", `/api/desk/tickets/${id}/transition`, { to: "waiting_customer" });
  assert.equal((await papi("c1", "POST", `/api/portal/tickets/${id}/comments`, { body: "aquí va la info" })).status, 201);
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${id}`)).body.ticket.status, "in_progress");
});

test("attachments: allow-list, size, and isolation", { skip: !run }, async () => {
  await portalLogin("c1", "c1@a.test"); await portalLogin("cb", "cb@b.test");
  const id = (await papi("c1", "POST", "/api/portal/tickets", { accountId: accA, type: "question", title: "Con adjunto" })).body.id;
  const up = (who: string, mime: string, body: Buffer, p = `/api/portal/tickets/${id}/attachments?filename=a.png`) =>
    fetch(base + p, { method: "POST", headers: { "content-type": mime, cookie: jars[who] }, body });
  assert.equal((await up("c1", "text/html", Buffer.from("<script>"))).status, 400);
  const ok = await up("c1", "image/png", Buffer.from([137, 80, 78, 71]));
  assert.equal(ok.status, 201);
  const aid = (await ok.json()).id;
  const dl = async (who: string, path: string) => (await fetch(base + path, { headers: { cookie: jars[who] } })).status;
  assert.equal(await dl("c1", `/api/portal/attachments/${aid}`), 200);
  assert.equal(await dl("cb", `/api/portal/attachments/${aid}`), 404);
  assert.equal((await up("cb", "image/png", Buffer.from([1]))).status, 404);
  assert.equal(await dl("agentA", `/api/desk/attachments/${aid}`), 200);
});

test("ticket events are immutable while the ticket exists", { skip: !run }, async () => {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const t = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "Inmutable" })).body;
  await assert.rejects(db.execute(sql`UPDATE sd_ticket_events SET kind = 'x' WHERE ticket_id = ${t.id}`));
  await assert.rejects(db.execute(sql`DELETE FROM sd_ticket_events WHERE ticket_id = ${t.id}`));
});

test("portal verify rejects non-JSON (login CSRF) and prefix is locked once tickets exist", { skip: !run }, async () => {
  const r = await fetch(base + "/api/portal/auth/verify", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=" + "z".repeat(30) });
  assert.equal(r.status, 415);
  const p = await api("owner", "PUT", `/api/desk/accounts/${accA}`, { clienteId: 1, accountType: "demo", ticketPrefix: "QQQ" });
  assert.equal(p.status, 409);
});

test("customers cannot see internal_task tickets; assignee must have access", { skip: !run }, async () => {
  const t = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "internal_task", title: "Tarea interna", requesterContactId: contactIds.c1, sharedWithAccount: true })).body;
  assert.equal((await papi("adm", "GET", `/api/portal/tickets/${t.id}`)).status, 404);
  assert.ok(!(await papi("adm", "GET", "/api/portal/tickets")).body.some((x: any) => x.id === t.id));
  const nobodyId = ids.users[3];
  assert.equal((await api("owner", "PATCH", `/api/desk/tickets/${t.id}`, { assigneeUserId: nobodyId })).status, 400);
});

test("SLA: per-ticket view, instances persisted, scoped access", { skip: !run }, async () => {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const t = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "incident", title: "Con SLA", severity: "P2", channel: "manual" })).body;
  const v = await api("agentA", "GET", `/api/desk/tickets/${t.id}/sla`);
  assert.equal(v.status, 200);
  assert.equal(v.body.policy.name, "Incidente P2");
  assert.deepEqual(v.body.metrics.map((m: any) => m.key).sort(), ["first_response", "resolution"]);
  assert.equal((await api("l1", "GET", `/api/desk/tickets/${t.id}/sla`)).status, 200);
  assert.equal((await api("nobody", "GET", `/api/desk/tickets/${t.id}/sla`)).status, 403);
  const other = (await api("owner", "POST", "/api/desk/tickets", { accountId: accB, type: "incident", title: "Otro", severity: "P3", channel: "manual" })).body;
  assert.equal((await api("agentA", "GET", `/api/desk/tickets/${other.id}/sla`)).status, 404);
  let rows: any[] = [];
  for (let i = 0; i < 20 && rows.length < 2; i++) { rows = (await db.execute(sql`SELECT metric FROM sd_sla_instances WHERE ticket_id = ${t.id}`)).rows as any[]; if (rows.length < 2) await new Promise((r) => setTimeout(r, 250)); }
  assert.equal(rows.length, 2);
});

test("SLA: exclusion needs a manager and a catalog reason; customers never see it", { skip: !run }, async () => {
  await portalLogin("c1", "c1@a.test");
  const t = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "incident", title: "Excluible", severity: "P3", channel: "manual", requesterContactId: contactIds.c1 })).body;
  const view = await papi("c1", "GET", `/api/portal/tickets/${t.id}`);
  assert.deepEqual(view.body.sla.metrics.map((m: any) => m.key).sort(), ["first_response", "resolution"]);
  assert.ok(!JSON.stringify(view.body).includes("Incidente P3"));
  assert.equal((await api("agentA", "POST", `/api/desk/tickets/${t.id}/sla-exclusion`, { reason: "force_majeure" })).status, 403);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${t.id}/sla-exclusion`, { reason: "porque si" })).status, 400);
  const ex = await api("owner", "POST", `/api/desk/tickets/${t.id}/sla-exclusion`, { reason: "third_party_declared", note: "Caída de AWS" });
  assert.equal(ex.status, 200);
  assert.ok(ex.body.metrics.every((m: any) => m.state === "excluded"));
  assert.equal((await papi("c1", "GET", `/api/portal/tickets/${t.id}`)).body.sla, null);
  assert.ok(!(await papi("c1", "GET", `/api/portal/tickets/${t.id}`)).raw.includes("AWS"));
  assert.equal((await api("owner", "GET", "/api/desk/sla/exclusions")).body.some((x: any) => x.id === t.id), true);
  const back = await api("owner", "DELETE", `/api/desk/tickets/${t.id}/sla-exclusion`);
  assert.ok(back.body.metrics.every((m: any) => m.state !== "excluded"));
});

test("SLA: waiting_customer pauses and is visible to the customer with its reason", { skip: !run }, async () => {
  await portalLogin("c1", "c1@a.test");
  const t = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "incident", title: "Pausa", severity: "P3", channel: "manual", requesterContactId: contactIds.c1 })).body;
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${t.id}/transition`, { to: "in_progress" })).status, 200);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${t.id}/transition`, { to: "waiting_customer" })).status, 200);
  const v = (await papi("c1", "GET", `/api/portal/tickets/${t.id}`)).body.sla.metrics.find((m: any) => m.key === "resolution");
  assert.equal(v.paused, true);
  assert.equal(v.pauses[0].label, "Esperando tu respuesta");
  const tp = await api("owner", "POST", `/api/desk/tickets/${t.id}/transition`, { to: "in_progress" });
  assert.equal(tp.status, 200);
  assert.equal((await papi("c1", "GET", `/api/portal/tickets/${t.id}`)).body.sla.metrics.find((m: any) => m.key === "resolution").paused, false);
});

test("SLA: policy and holiday management is manager-only and recalculates", { skip: !run }, async () => {
  const body = { name: "TMPT política", position: 5, filters: { accountIds: [accA], types: ["question"] }, calendarKind: "business", firstResponseMin: 60, updateMin: null, resolutionMin: 120 };
  assert.equal((await api("l1", "POST", "/api/desk/sla/policies", body)).status, 403);
  assert.equal((await api("owner", "PUT", "/api/desk/sla/calendar", { tz: "America/Mexico_City", days: [1], start: "09:00", end: "99:00" })).status, 400);
  assert.equal((await api("owner", "POST", "/api/desk/sla/policies", { ...body, firstResponseMin: 0 })).status, 400);
  const c = await api("owner", "POST", "/api/desk/sla/policies", body);
  assert.equal(c.status, 201);
  const pid = c.body.policy.id;
  const q = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "Pregunta con política propia", channel: "manual" })).body;
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${q.id}/sla`)).body.policy.name, "TMPT política");
  const up = await api("owner", "PUT", `/api/desk/sla/policies/${pid}`, { ...body, firstResponseMin: 30 });
  assert.equal(up.body.policy.version, 2);
  const h = await api("owner", "POST", "/api/desk/sla/holidays", { date: "2031-01-02", name: "TMPT", accountId: accA });
  assert.equal(h.status, 201);
  assert.equal((await api("owner", "POST", "/api/desk/sla/holidays", { date: "2031-01-02", name: "TMPT", accountId: accA })).status, 409);
  assert.equal((await api("owner", "DELETE", `/api/desk/sla/holidays/${h.body.holiday.id}`)).status, 200);
  assert.equal((await api("owner", "DELETE", `/api/desk/sla/policies/${pid}`)).status, 200);
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${q.id}/sla`)).body.policy.name, "Solicitudes y preguntas");
});

test("SLA: tick endpoint requires the secret token", { skip: !run }, async () => {
  const tick = (tok?: string) => fetch(base + "/api/internal/sla/tick", { method: "POST", headers: tok ? { "x-tick-token": tok } : {} });
  assert.equal((await tick()).status, 401);
  assert.equal((await tick("nope")).status, 401);
  assert.equal((await api("agentA", "POST", "/api/desk/sla/tick-token")).status, 403);
  const { token } = (await api("owner", "POST", "/api/desk/sla/tick-token")).body;
  assert.equal(token.length, 64);
  assert.equal((await tick("nope")).status, 401);
  const ok = await tick(token);
  assert.equal(ok.status, 200);
  assert.equal(typeof (await ok.json()).refreshed, "number");
});

test("import: CSV preview/commit is manager-only, idempotent, SLA-excluded and flagged", { skip: !run }, async () => {
  const csv = "Folio;Asunto;Prioridad;Estatus;Fecha de reporte;Fecha de resolución;Horas\n" +
    "T-1;Falla de login;P0;Cerrado;05/03/2026 10:00;06/03/2026 12:00;1,5\n" +
    "T-2;Reporte lento;Media;En proceso;07/03/2026;;\n" +
    "T-3;;Baja;Abierto;08/03/2026;;\n";
  const post = (who: string, path: string, body: string, ct = "text/csv") =>
    fetch(base + path, { method: "POST", headers: { "content-type": ct, cookie: jars[who] }, body }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const q = `?accountId=${accA}`;
  assert.equal((await post("agentA", `/api/desk/import/preview${q}`, csv)).status, 403);
  assert.equal((await post("owner", `/api/desk/import/preview${q}`, JSON.stringify({ a: 1 }), "application/json")).status, 400);
  assert.equal((await post("owner", `/api/desk/import/preview?accountId=999999999`, csv)).status, 404);
  const pv = await post("owner", `/api/desk/import/preview${q}`, csv);
  assert.equal(pv.status, 200);
  assert.equal(pv.body.mapping.title, "Asunto");
  assert.equal(pv.body.summary.importable, 2);
  assert.equal(pv.body.summary.skipped, 1);
  const c1 = await post("owner", `/api/desk/import/commit${q}`, csv);
  assert.equal(c1.status, 201);
  assert.equal(c1.body.imported, 2);
  const c2 = await post("owner", `/api/desk/import/commit${q}`, csv);
  assert.equal(c2.body.imported, 0);
  assert.equal(c2.body.alreadyImported, 2);
  const list = (await api("owner", "GET", `/api/desk/tickets?accountId=${accA}&q=login`)).body.rows;
  const t = list.find((x: any) => x.title === "Falla de login");
  assert.ok(t);
  const d = (await api("owner", "GET", `/api/desk/tickets/${t.id}`)).body;
  assert.equal(d.ticket.status, "closed");
  assert.equal(d.ticket.severity, null);
  assert.equal(d.ticket.perceivedSeverity, "P0");
  assert.equal(d.ticket.slaApplicable, false);
  assert.ok(d.ticket.createdAt.startsWith("2026-03-05T16:00"));
  const sla = await api("owner", "GET", `/api/desk/tickets/${t.id}/sla`);
  assert.ok(sla.body.metrics.every((m: any) => m.state === "excluded"));
});

test("SDK: JWT ingest creates a widget ticket for the right tenant; origins, scope and keys enforced", { skip: !run }, async () => {
  const { db } = await import("../db");
  const sc = await import("@shared/schema");
  const { signJwt } = await import("./sdkAuth");
  await db.insert(sc.sdInstances).values([{ accountId: accA, productId: ids.product, name: "TMPT Planta" }, { accountId: accB, productId: ids.product, name: "TMPT Otra" }]);
  assert.equal((await api("l1", "POST", "/api/desk/sdk/keys", { productId: ids.product, name: "x" })).status, 403);
  assert.equal((await api("agentA", "GET", "/api/desk/sdk/keys")).status, 403);
  assert.equal((await api("owner", "POST", "/api/desk/sdk/keys", { productId: ids.product, name: "TMPT key", allowedOrigins: ["https://app.cliente.com/ruta"] })).status, 400);
  const k = await api("owner", "POST", "/api/desk/sdk/keys", { productId: ids.product, name: "TMPT key", allowedOrigins: ["https://app.cliente.com"] });
  assert.equal(k.status, 201);
  assert.equal(k.body.secret.length, 64);
  assert.ok(!(await api("owner", "GET", "/api/desk/sdk/keys")).raw.includes(k.body.secret));
  const now = Math.floor(Date.now() / 1000);
  const tok = (o: object = {}, secret = k.body.secret) => signJwt({ sub: "u-77", email: "Ana.SDK@cliente.com", name: "Ana", tenant: "TMPT Planta", iat: now, exp: now + 300, ...o }, secret, k.body.keyId);
  const call = (method: string, path: string, token: string | null, body?: any, headers: Record<string, string> = {}) =>
    fetch(base + path, { method, headers: { ...(body && !Buffer.isBuffer(body) ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined })
      .then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));
  const good = { title: "No guarda el formulario", description: "Al dar guardar no pasa nada", type: "incident", perceivedSeverity: "P0", context: { url: "https://app.cliente.com/orden/5?token=SECRETO#x", consoleErrors: ["TypeError: x"], userAgent: "UA" } };
  const O = { origin: "https://app.cliente.com" };
  assert.equal((await call("POST", "/api/v1/sdk/tickets", null, good, O)).status, 401);
  assert.equal((await call("POST", "/api/v1/sdk/tickets", tok({}, "x".repeat(64)), good, O)).status, 401);
  assert.equal((await call("POST", "/api/v1/sdk/tickets", tok({ tenant: "Nadie" }), good, O)).status, 400);
  assert.equal((await call("POST", "/api/v1/sdk/tickets", tok({ tenant: undefined }), good, O)).status, 400);
  assert.equal((await call("POST", "/api/v1/sdk/tickets", tok(), good, { origin: "https://evil.com" })).status, 403);
  const pre = await fetch(base + "/api/v1/sdk/tickets", { method: "OPTIONS", headers: { origin: "https://app.cliente.com", "access-control-request-method": "POST" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://app.cliente.com");
  const evil = await fetch(base + "/api/v1/sdk/tickets", { method: "OPTIONS", headers: { origin: "https://evil.com" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const r = await call("POST", "/api/v1/sdk/tickets", tok(), good, O);
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://app.cliente.com");
  const d = (await api("owner", "GET", `/api/desk/tickets/${r.body.id}`)).body.ticket;
  assert.equal(d.channel, "widget");
  assert.equal(d.accountId, accA);
  assert.equal(d.severity, null);
  assert.equal(d.perceivedSeverity, "P0");
  assert.equal(d.context.url, "https://app.cliente.com/orden/5");
  const contact = (await api("owner", "GET", `/api/desk/contacts?accountId=${accA}`)).body.find((c: any) => c.email === "ana.sdk@cliente.com");
  assert.ok(contact);
  assert.equal(d.requesterContactId, contact.id);
  const png = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
  const up = (token: string, mime = "image/png") => fetch(base + `/api/v1/sdk/tickets/${r.body.id}/attachments?filename=captura.png`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": mime, ...O }, body: png }).then((x) => x.status);
  assert.equal(await up(tok()), 201);
  assert.equal(await up(tok({ sub: "u-78", email: "otra@cliente.com" })), 404);
  assert.equal(await up(tok(), "application/pdf"), 400);
  assert.equal((await call("GET", "/api/v1/sdk/tickets", tok(), undefined, O)).body.length, 1);
  assert.equal((await call("GET", "/api/v1/sdk/tickets", tok({ email: "otra@cliente.com" }), undefined, O)).body.length, 0);
  // Detail for the end user: progress (status history) and public notes only, never internal notes, reasons or names.
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${r.body.id}/transition`, { to: "in_progress" })).status, 200);
  await api("owner", "POST", `/api/desk/tickets/${r.body.id}/comments`, { body: "NOTA-INTERNA-SECRETA", visibility: "internal" });
  await api("owner", "POST", `/api/desk/tickets/${r.body.id}/comments`, { body: "Ya lo estamos revisando", visibility: "public" });
  const det = await call("GET", `/api/v1/sdk/tickets/${r.body.id}`, tok(), undefined, O);
  assert.equal(det.status, 200);
  assert.equal(det.body.ticket.key, r.body.key);
  assert.equal(det.body.ticket.status, "in_progress");
  assert.deepEqual(det.body.comments.map((c: any) => c.body), ["Ya lo estamos revisando"]);
  assert.equal(det.body.comments[0].authorType, "user");
  assert.ok(det.body.history.some((h: any) => h.to === "in_progress"));
  const raw = JSON.stringify(det.body);
  assert.ok(!raw.includes("NOTA-INTERNA-SECRETA"));
  assert.ok(!raw.includes("assignee") && !raw.includes("reason"));
  assert.equal((await call("GET", `/api/v1/sdk/tickets/${r.body.id}`, tok({ sub: "u-78", email: "otra@cliente.com" }), undefined, O)).status, 404);
  assert.equal((await call("GET", `/api/v1/sdk/tickets/999999999`, tok(), undefined, O)).status, 404);
  assert.equal((await call("GET", "/api/v1/sdk/tickets", tok(), undefined, O)).body[0].updatedAt !== undefined, true);
  const rot = await api("owner", "POST", `/api/desk/sdk/keys/${k.body.id}/rotate`);
  assert.equal(rot.status, 200);
  assert.equal((await call("POST", "/api/v1/sdk/tickets", tok(), good, O)).status, 401); // old secret no longer valid
  await api("owner", "PUT", `/api/desk/sdk/keys/${k.body.id}`, { name: "TMPT key", allowedOrigins: [], active: false });
  assert.equal((await call("POST", "/api/v1/sdk/tickets", signJwt({ sub: "u", email: "a@b.co", tenant: "TMPT Planta", iat: now, exp: now + 60 }, rot.body.secret, k.body.keyId), good, O)).status, 401);
});

test("availability: monitors, 2-location down minutes, public status page, incidents and maintenance", { skip: !run }, async () => {
  const { db } = await import("../db");
  const sc = await import("@shared/schema");
  const [inst] = await db.insert(sc.sdInstances).values({ accountId: accA, productId: ids.product, name: "TMPT Mon" }).returning();
  const mon = { instanceId: inst.id, name: "TMPT Plataforma", url: "https://example.com/health/deep", isPublic: true };
  assert.equal((await api("l1", "POST", "/api/desk/monitors", mon)).status, 403);
  assert.equal((await api("agentA", "POST", "/api/desk/monitors", mon)).status, 403);
  assert.equal((await api("owner", "POST", "/api/desk/monitors", { ...mon, url: "http://example.com/h" })).status, 400);
  assert.equal((await api("owner", "POST", "/api/desk/monitors", { ...mon, url: "https://169.254.169.254/x" })).status, 400);
  const m = await api("owner", "POST", "/api/desk/monitors", mon);
  assert.equal(m.status, 201);
  const base0 = Math.floor(Date.now() / 60000) * 60000 - 90 * 60000;
  const rows: any[] = [];
  for (let i = 0; i < 60; i++) {
    const down = i >= 10 && i < 20, single = i >= 30 && i < 35;
    rows.push({ monitorId: m.body.id, minute: new Date(base0 + i * 60000), location: "us-central1", ok: !(down || single) });
    rows.push({ monitorId: m.body.id, minute: new Date(base0 + i * 60000), location: "us-east1", ok: !down });
  }
  await db.insert(sc.sdProbeResults).values(rows);
  const now = new Date();
  const mx = new Date(now.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
  const av = await api("l1", "GET", `/api/desk/availability?year=${mx.getFullYear()}&month=${mx.getMonth() + 1}`);
  assert.equal(av.status, 200);
  const row = av.body.monitors.find((x: any) => x.monitorId === m.body.id);
  assert.equal(row.downMinutes, 10);          // only minutes failing from 2 locations
  assert.equal(row.unconfirmedMinutes, 0);    // a failure seen from one location while the other is ok does not count as down
  assert.ok(row.pct < 100 && row.pct > 0);
  const st = await fetch(base + "/api/status").then((r) => r.json());
  const prod = st.products.find((p: any) => p.components.some((c: any) => c.name === "TMPT Plataforma"));
  assert.ok(prod);
  assert.equal(prod.components[0].days.length, 90);
  assert.ok(!JSON.stringify(st).includes("TMPT Mon") && !JSON.stringify(st).includes("example.com"));
  assert.equal((await fetch(base + "/api/internal/probe?loc=test", { method: "POST" })).status, 401);
  assert.equal((await api("l1", "POST", "/api/desk/platform-incidents", { productId: ids.product, title: "Caída", body: "Investigando" })).status, 403);
  const inc = await api("owner", "POST", "/api/desk/platform-incidents", { productId: ids.product, title: "TMPT caída parcial", impact: "major", body: "Estamos investigando" });
  assert.equal(inc.status, 201);
  assert.equal((await api("owner", "POST", `/api/desk/platform-incidents/${inc.body.id}/updates`, { status: "resolved", body: "Resuelto" })).status, 400);
  const st2 = await fetch(base + "/api/status").then((r) => r.json());
  assert.equal(st2.products.find((p: any) => p.name === "TMPT product").status, "degraded");
  const ok = await api("owner", "POST", `/api/desk/platform-incidents/${inc.body.id}/updates`, { status: "resolved", body: "Resuelto", rca: { cause: "c", fix: "f", prevention: "p" } });
  assert.equal(ok.status, 200);
  const soon = new Date(Date.now() + 3 * 3600_000).toISOString(), later = new Date(Date.now() + 72 * 3600_000).toISOString();
  const short = await api("owner", "POST", "/api/desk/maintenance", { productId: ids.product, title: "TMPT corto aviso", startsAt: soon, endsAt: new Date(Date.now() + 4 * 3600_000).toISOString() });
  assert.equal(short.status, 201);
  assert.ok(short.body.warning);
  const long = await api("owner", "POST", "/api/desk/maintenance", { productId: ids.product, title: "TMPT anunciado", startsAt: later, endsAt: new Date(Date.now() + 73 * 3600_000).toISOString() });
  assert.equal(long.body.warning, null);
  assert.equal((await api("owner", "POST", "/api/desk/maintenance", { productId: ids.product, title: "x largo", startsAt: later, endsAt: new Date(Date.now() + 200 * 3600_000).toISOString() })).status, 400);
});

test("reports: generate, immutable snapshot, approval flow, versions, portal visibility", { skip: !run }, async () => {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const csv = "Folio;Asunto;Prioridad;Estatus;Fecha de reporte;Fecha de resolución\nR-1;Falla en octubre;Media;Cerrado;05/10/2026 10:00;06/10/2026 10:00\nR-2;Otra de octubre;Baja;Abierto;10/10/2026;\n";
  const imp = await fetch(base + `/api/desk/import/commit?accountId=${accA}`, { method: "POST", headers: { "content-type": "text/csv", cookie: jars.owner }, body: csv });
  assert.equal(imp.status, 201);
  const body = { accountId: accA, year: 2026, month: 10 };
  assert.equal((await api("l1", "POST", "/api/desk/reports", body)).status, 403);
  assert.equal((await api("agentA", "POST", "/api/desk/reports", body)).status, 403);
  assert.equal((await api("owner", "POST", "/api/desk/reports", { ...body, year: 2099, month: 1 })).status, 400);
  const g = await api("owner", "POST", "/api/desk/reports", body);
  assert.equal(g.status, 201);
  assert.equal(g.body.version, 1);
  assert.equal((await api("owner", "POST", "/api/desk/reports", body)).status, 409); // draft already exists
  const v = await api("agentA", "GET", `/api/desk/reports/${g.body.id}`);
  assert.equal(v.status, 200);
  assert.ok(v.body.html.includes("Informe mensual de servicio") && v.body.html.includes("N/D") && v.body.html.includes("octubre de 2026"));
  assert.ok(v.body.html.includes("Falla en octubre"));
  assert.equal((await api("owner", "GET", `/api/desk/reports?accountId=${accB}`)).status, 200);
  assert.equal((await api("agentA", "GET", `/api/desk/reports?accountId=${accB}`)).status, 404);
  assert.equal((await api("owner", "POST", `/api/desk/reports/${g.body.id}/send`)).status, 409); // not approved
  assert.equal((await api("owner", "POST", `/api/desk/reports/${g.body.id}/approve`)).status, 200);
  assert.equal((await api("owner", "DELETE", `/api/desk/reports/${g.body.id}`)).status, 409);
  await assert.rejects(db.execute(sql`UPDATE sd_reports SET data = '{}'::jsonb WHERE id = ${g.body.id}`));
  const sent = await api("owner", "POST", `/api/desk/reports/${g.body.id}/send`);
  assert.equal(sent.status, 200);
  assert.equal(sent.body.recipients, 1); // adm@a.test (account_admin)
  await db.execute(sql`UPDATE sd_reports SET status = 'sent', sent_at = now() WHERE id = ${g.body.id}`);
  assert.equal((await api("owner", "POST", "/api/desk/reports", body)).status, 400); // new version needs a correction note
  const v2 = await api("owner", "POST", "/api/desk/reports", { ...body, note: "Corrección de horas" });
  assert.equal(v2.status, 201);
  assert.equal(v2.body.version, 2);
  assert.equal((await api("owner", "DELETE", `/api/desk/reports/${v2.body.id}`)).status, 200);
  await portalLogin("adm", "adm@a.test"); await portalLogin("c1", "c1@a.test"); await portalLogin("cb", "cb@b.test");
  const list = await papi("adm", "GET", "/api/portal/reports");
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, g.body.id);
  const view = await papi("adm", "GET", `/api/portal/reports/${g.body.id}`);
  assert.equal(view.status, 200);
  assert.ok(view.body.html.includes("octubre de 2026"));
  assert.deepEqual((await papi("c1", "GET", "/api/portal/reports")).body, []);
  assert.equal((await papi("c1", "GET", `/api/portal/reports/${g.body.id}`)).status, 404);
  assert.equal((await papi("cb", "GET", `/api/portal/reports/${g.body.id}`)).status, 404);
  assert.equal((await fetch(base + "/api/internal/reports/run", { method: "POST" })).status, 401);
});

test("features: consolidation, quotes, UAT Go/No-Go, tacit acceptance, hours bank", { skip: !run }, async () => {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const mk = async (who: string, accountId: number, title: string) => (await api(who, "POST", "/api/desk/tickets", { accountId, type: "feature_request", title, channel: "manual" })).body;
  const ta = await mk("owner", accA, "TMPT exportar a Excel"), tb = await mk("owner", accB, "TMPT excel export");
  const inc = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "TMPT una pregunta", channel: "manual" })).body;
  assert.equal((await api("l1", "POST", "/api/desk/features", { title: "TMPT Exportación", ticketIds: [ta.id] })).status, 403);
  assert.equal((await api("agentA", "POST", "/api/desk/features", { title: "TMPT Exportación", ticketIds: [ta.id] })).status, 403);
  assert.equal((await api("owner", "POST", "/api/desk/features", { title: "TMPT Exportación", ticketIds: [inc.id] })).status, 400); // not a feature request
  const f = await api("owner", "POST", "/api/desk/features", { title: "TMPT Exportación", productId: ids.product, ticketIds: [ta.id, tb.id] });
  assert.equal(f.status, 201);
  const fid = f.body.id;
  assert.equal((await api("owner", "POST", "/api/desk/features", { title: "TMPT otra", ticketIds: [ta.id] })).status, 409); // already consolidated
  await api("owner", "POST", `/api/desk/features/${fid}/requests`, { ticketId: tb.id, weight: 3 });
  const list = (await api("owner", "GET", "/api/desk/features")).body.find((x: any) => x.id === fid);
  assert.equal(list.requests, 2); assert.equal(list.accounts, 2); assert.equal(list.weight, 4);
  // scope: agent of A sees the feature but only its own request
  const det = await api("agentA", "GET", `/api/desk/features/${fid}`);
  assert.equal(det.status, 200);
  assert.equal(det.body.requests.length, 1);
  assert.ok(!det.raw.includes("TMPT B"));
  assert.equal((await api("nobody", "GET", `/api/desk/features/${fid}`)).status, 403);
  // date commitment with history
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/date`, { targetDate: "2027-01-15" })).status, 200);
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/date`, { targetDate: "2027-02-15" })).status, 400); // change needs a reason
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/date`, { targetDate: "2027-02-15", reason: "Dependencia externa" })).status, 200);
  assert.equal((await api("owner", "GET", `/api/desk/features/${fid}`)).body.dates.length, 2);
  // quote: validation, send, customer decision
  const q = { accountId: accA, scope: "Exportación a Excel del listado de órdenes", hours: 20, cost: 18000, currency: "MXN", assumptions: "Datos disponibles", validUntil: "2099-01-01", outOfContract: true };
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/quotes`, { ...q, hours: 0 })).status, 400);
  const qc = await api("owner", "POST", `/api/desk/features/${fid}/quotes`, q);
  assert.equal(qc.status, 201);
  await portalLogin("adm", "adm@a.test"); await portalLogin("c1", "c1@a.test"); await portalLogin("cb", "cb@b.test");
  assert.deepEqual((await papi("adm", "GET", "/api/portal/features")).body.map((x: any) => x.quotes.length), [0]); // drafts invisible
  assert.equal((await api("owner", "POST", `/api/desk/quotes/${qc.body.id}/send`)).status, 200);
  assert.equal((await api("owner", "POST", `/api/desk/quotes/${qc.body.id}/send`)).status, 409);
  assert.equal((await api("owner", "PATCH", `/api/desk/quotes/${qc.body.id}`, q)).status, 409); // sent: immutable
  const pf = (await papi("adm", "GET", "/api/portal/features")).body[0];
  assert.equal(pf.status, "quoted"); assert.equal(pf.outOfContract, true);
  assert.equal(pf.quotes[0].canDecide, true);
  assert.equal((await papi("c1", "GET", "/api/portal/features")).body[0].quotes[0].canDecide, false);
  assert.equal((await papi("c1", "POST", `/api/portal/quotes/${qc.body.id}/decision`, { decision: "approved" })).status, 404);
  assert.equal((await papi("cb", "POST", `/api/portal/quotes/${qc.body.id}/decision`, { decision: "approved" })).status, 404);
  assert.deepEqual((await papi("cb", "GET", "/api/portal/features")).body.map((x: any) => x.quotes.length), [0]); // B never sees A's quote
  assert.equal((await papi("adm", "POST", `/api/portal/quotes/${qc.body.id}/decision`, { decision: "rejected" })).status, 400); // reason required
  assert.equal((await papi("adm", "POST", `/api/portal/quotes/${qc.body.id}/decision`, { decision: "approved" })).status, 200);
  assert.equal((await papi("adm", "POST", `/api/portal/quotes/${qc.body.id}/decision`, { decision: "rejected", note: "x" })).status, 409); // final
  assert.equal((await api("owner", "GET", `/api/desk/features/${fid}`)).body.feature.status, "approved");
  // expired quote cannot be approved
  const q2 = await api("owner", "POST", `/api/desk/features/${fid}/quotes`, { ...q, validUntil: "2099-01-01" });
  await api("owner", "POST", `/api/desk/quotes/${q2.body.id}/send`);
  await db.execute(sql`UPDATE sd_feature_quotes SET valid_until = '2020-01-01' WHERE id = ${q2.body.id}`);
  assert.equal((await papi("adm", "POST", `/api/portal/quotes/${q2.body.id}/decision`, { decision: "approved" })).status, 409);
  // UAT: cannot release without a list; No Go makes a child ticket; Go releases
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/uat/start`)).status, 400);
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/release`)).status, 409);
  assert.equal((await api("owner", "PATCH", `/api/desk/features/${fid}`, { status: "in_development" })).status, 200);
  const u1 = await api("owner", "POST", `/api/desk/features/${fid}/uat`, { accountId: accA, what: "Botón Exportar en órdenes", how: "Abrir órdenes y pulsar Exportar" });
  assert.equal(u1.status, 201);
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/uat`, { accountId: accB, what: "Botón Exportar", how: "x" })).status, 201);
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/uat/start`)).status, 200);
  assert.equal((await papi("adm", "POST", `/api/portal/uat/${u1.body.id}/decision`, { status: "no_go" })).status, 400); // comment required
  const ng = await papi("adm", "POST", `/api/portal/uat/${u1.body.id}/decision`, { status: "no_go", comment: "Falla con acentos" });
  assert.equal(ng.status, 200);
  assert.ok(ng.body.childTicketId);
  assert.equal((await api("owner", "GET", `/api/desk/features/${fid}`)).body.feature.status, "in_development");
  const child = await api("owner", "GET", `/api/desk/tickets/${ng.body.childTicketId}`);
  assert.equal(child.body.ticket.type, "incident");
  assert.equal((await api("owner", "POST", `/api/desk/features/${fid}/uat/start`)).status, 200); // retest resets No Go to pending
  const items = (await api("owner", "GET", `/api/desk/features/${fid}`)).body.uat;
  assert.deepEqual(items.map((i: any) => i.status), ["pending", "pending"]);
  const go = await papi("adm", "POST", `/api/portal/uat/${items[0].id}/decision`, { status: "go" });
  assert.equal(go.status, 200); assert.equal(go.body.released, false); // B's item still pending
  assert.equal((await papi("adm", "POST", `/api/portal/uat/${items[0].id}/decision`, { status: "go" })).status, 409);
  // tacit acceptance after N days
  await db.execute(sql`UPDATE sd_features SET uat_started_at = now() - interval '11 days' WHERE id = ${fid}`);
  const { featureTick } = await import("./featureService");
  await featureTick();
  const fin = (await api("owner", "GET", `/api/desk/features/${fid}`)).body;
  assert.equal(fin.feature.status, "released");
  assert.equal(fin.feature.releaseKind, "tacit");
  assert.ok(fin.uat.some((i: any) => i.tacit));
  // hours bank
  await db.execute(sql`DELETE FROM sd_time_entries WHERE ticket_id IN (SELECT id FROM sd_tickets WHERE account_id = ${accA})`); // earlier tests log time on this account; the bank is account-wide
  await db.execute(sql`UPDATE sd_contracts SET hours_bank = 1, extra_hour_rate = 500 WHERE account_id = ${accA}`);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${ta.id}/time`, { minutes: 54, billable: true, workDate: "2026-11-09" })).status, 201);
  let bank = (await api("owner", "GET", `/api/desk/accounts/${accA}/hours-bank`)).body;
  assert.equal(bank.level, "warn"); assert.equal(bank.pct, 90);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${ta.id}/time`, { minutes: 90, billable: false, workDate: "2026-11-09" })).status, 201); // non-billable not deducted
  await api("owner", "POST", `/api/desk/tickets/${ta.id}/time`, { minutes: 66, billable: true, workDate: "2026-11-09" });
  bank = (await api("owner", "GET", `/api/desk/accounts/${accA}/hours-bank`)).body;
  assert.equal(bank.level, "over"); assert.equal(bank.consumedHours, 2); assert.equal(bank.extraHours, 1); assert.equal(bank.extraCost, 500);
  assert.equal((await api("agentA", "GET", `/api/desk/accounts/${accB}/hours-bank`)).status, 404);
  await new Promise((r) => setTimeout(r, 1500));
  const alerts = await db.execute(sql`SELECT threshold FROM sd_bank_alerts a JOIN sd_contracts c ON c.id = a.contract_id WHERE c.account_id = ${accA} ORDER BY 1`);
  assert.deepEqual((alerts.rows as any[]).map((r) => r.threshold), [80, 100]);
});

test("projects: template, schedule, plan approval, baseline revisions, gate sign-off, customer view", { skip: !run }, async () => {
  assert.equal((await api("l1", "POST", "/api/desk/projects", { accountId: accA, name: "TMPT Proyecto", startDate: "2026-11-09", template: "generic" })).status, 403);
  assert.equal((await api("agentA", "POST", "/api/desk/projects", { accountId: accA, name: "TMPT Proyecto", startDate: "2026-11-09", template: "generic" })).status, 403);
  assert.equal((await api("owner", "POST", "/api/desk/projects", { accountId: accA, name: "TMPT Proyecto", startDate: "no", template: "generic" })).status, 400);
  const c = await api("owner", "POST", "/api/desk/projects", { accountId: accA, name: "TMPT Proyecto", solutionType: "TMS", startDate: "2026-11-07", template: "generic" }); // Saturday: rolls to Monday
  assert.equal(c.status, 201);
  const pid = c.body.id;
  let d = (await api("agentA", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal(d.project.startDate, "2026-11-09");
  assert.equal(d.tasks.length, 12); assert.equal(d.gates.length, 9);
  const t01 = d.tasks.find((t: any) => t.code === "0.1");
  assert.equal(t01.startDate, "2026-11-09"); assert.equal(t01.endDate, "2026-11-13"); // 5 business days
  const t11 = d.tasks.find((t: any) => t.code === "1.1");
  assert.ok(t11.startDate > t01.endDate); // finish-to-start
  assert.equal((await api("nobody", "GET", "/api/desk/projects")).status, 403);
  assert.equal((await api("agentA", "GET", "/api/desk/projects")).body.length >= 1, true);
  // cannot approve until internal tasks have an owner
  const a1 = await api("owner", "POST", `/api/desk/projects/${pid}/approve-plan`);
  assert.equal(a1.status, 409); assert.match(a1.body.message, /responsable/);
  const ag = (await api("owner", "GET", "/api/desk/agents")).body.find((u: any) => u.username.startsWith("tmpt_owner"));
  for (const t of d.tasks.filter((t: any) => !t.clientSide)) { const rr = await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t.id}`, { assigneeUserId: ag.id }); assert.equal(rr.status, 200, JSON.stringify(rr.body) + " ag=" + JSON.stringify(ag)); }
  // cycles and partial progress rules
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { deps: [t11.id] })).status, 400);
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { pct: 50 })).status, 400); // needs a note
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { pct: 50, progressNote: "mitad del levantamiento" })).status, 200);
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { pct: 0 })).status, 200);
  { const ap = await api("owner", "POST", `/api/desk/projects/${pid}/approve-plan`); assert.equal(ap.status, 200, JSON.stringify(ap.body)); }
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/approve-plan`)).status, 409);
  // schedule changes after baseline need reason + origin and create a revision
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { days: 7 })).status, 400);
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { days: 7, reason: "Más entrevistas", origin: "customer" })).status, 200);
  d = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal(d.project.baselineVersion, 2);
  assert.deepEqual(d.revisions.map((r: any) => r.origin), ["qss", "customer"]);
  const t01b = d.tasks.find((t: any) => t.id === t01.id);
  assert.equal(t01b.endDate, "2026-11-18"); // 7 business days, skipping the 16-Nov holiday; assert.deepEqual(t01b.baseline, { start: "2026-11-09", end: "2026-11-13" }); // baseline vs current
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { notes: "solo nota" })).status, 200); // non-schedule edit: no revision
  assert.equal((await api("owner", "GET", `/api/desk/projects/${pid}`)).body.project.baselineVersion, 2);
  // hide one task and one gate from the customer
  const t22 = d.tasks.find((t: any) => t.code === "2.2");
  await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t22.id}`, { clientVisible: false, notes: "NOTA-INTERNA-SECRETA" });
  const gHidden = d.gates.find((g: any) => g.code === "G3"), gA = d.gates.find((g: any) => g.code === "G0"), gB = d.gates.find((g: any) => g.code === "G1");
  await api("owner", "PATCH", `/api/desk/projects/${pid}/gates/${gHidden.id}`, { clientVisible: false });
  await api("owner", "PATCH", `/api/desk/projects/${pid}/gates/${gA.id}`, { evidence: ["acta-firmada.pdf"] });
  // portal
  await portalLogin("adm", "adm@a.test"); await portalLogin("c1", "c1@a.test"); await portalLogin("cb", "cb@b.test");
  assert.equal((await papi("cb", "GET", `/api/portal/projects/${pid}`)).status, 404);
  assert.deepEqual((await papi("cb", "GET", "/api/portal/projects")).body, []);
  const pv = await papi("c1", "GET", `/api/portal/projects/${pid}`);
  assert.equal(pv.status, 200); assert.equal(pv.body.canSign, false);
  assert.ok(!pv.raw.includes("NOTA-INTERNA-SECRETA") && !pv.raw.includes("hours") && !pv.raw.includes("warnings") && !pv.raw.includes("assigneeUserId"));
  assert.ok(!pv.body.tasks.some((t: any) => t.code === "2.2")); assert.ok(!pv.body.gates.some((g: any) => g.code === "G3"));
  assert.ok(pv.body.tasks.find((t: any) => t.code === "0.2").owner === "cliente");
  assert.equal((await papi("c1", "POST", `/api/portal/gates/${gA.id}/signoff`, { result: "go" })).status, 404); // only account_admin signs
  assert.equal((await papi("cb", "POST", `/api/portal/gates/${gA.id}/signoff`, { result: "go" })).status, 404);
  assert.equal((await papi("adm", "POST", `/api/portal/gates/${gHidden.id}/signoff`, { result: "go" })).status, 404); // hidden
  assert.equal((await papi("adm", "POST", `/api/portal/gates/${gB.id}/signoff`, { result: "conditional" })).status, 400);
  assert.equal((await papi("adm", "POST", `/api/portal/gates/${gB.id}/signoff`, { result: "no_go", note: "falta evidencia" })).status, 200);
  assert.equal((await papi("adm", "GET", `/api/portal/projects/${pid}`)).body.gates.find((g: any) => g.id === gB.id).status, "open"); // No Go keeps it open
  const ok = await papi("adm", "POST", `/api/portal/gates/${gA.id}/signoff`, { result: "go" });
  assert.equal(ok.status, 200); assert.match(ok.body.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal((await papi("adm", "POST", `/api/portal/gates/${gA.id}/signoff`, { result: "go" })).status, 409);
  const so = await api("owner", "GET", `/api/desk/projects/${pid}/gates/${gA.id}/signoffs`);
  assert.equal(so.body.length, 1); assert.equal(so.body[0].signerType, "contact"); assert.ok(so.body[0].ip);
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/gates/${gA.id}`, { name: "x" })).status, 409); // signed gates are frozen
});

test("project items: DOC/P/R/MOD, payments, resource load, handoff to operation, module catalog", { skip: !run }, async () => {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const sc = await import("@shared/schema");
  const [inst] = await db.insert(sc.sdInstances).values({ accountId: accA, productId: ids.product, name: "TMPT ImplInst" }).returning();
  const c = await api("owner", "POST", "/api/desk/projects", { accountId: accA, name: "TMPT Items", startDate: "2026-11-09", template: "generic" });
  assert.equal(c.status, 201); const pid = c.body.id;
  const lc = async () => ((await db.execute(sql`SELECT lifecycle, sla_active_from FROM sd_contracts WHERE account_id = ${accA}`)).rows as any[])[0];
  assert.equal((await lc()).lifecycle, "implementation"); // SLA paused while implementing
  const tk = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, instanceId: inst.id, type: "incident", title: "TMPT durante implementación", severity: "P2", channel: "manual" })).body;
  const sla1 = (await api("owner", "GET", `/api/desk/tickets/${tk.id}/sla`)).body;
  assert.equal(sla1.excludedReason, "lifecycle_implementation"); assert.ok(sla1.metrics.length && sla1.metrics.every((m: any) => m.state === "excluded"));

  // DOC-xx
  assert.equal((await api("agentA", "POST", `/api/desk/projects/${pid}/docs`, { name: "Layout de facturas", priority: "A", dueDate: "2026-11-20" })).status, 403);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/docs`, { name: "Layout de facturas", priority: "Z", dueDate: "2026-11-20" })).status, 400);
  const d1 = (await api("owner", "POST", `/api/desk/projects/${pid}/docs`, { name: "Layout de facturas", priority: "A", dueDate: "2020-01-02", ownerContactId: contactIds.c1 })).body;
  const d2 = (await api("owner", "POST", `/api/desk/projects/${pid}/docs`, { name: "Catálogo de clientes", priority: "B", dueDate: "2099-01-02" })).body;
  assert.equal(d1.code, "DOC-01"); assert.equal(d2.code, "DOC-02");
  let det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  const t11 = det.tasks.find((t: any) => t.code === "1.1");
  assert.equal((await api("owner", "PUT", `/api/desk/projects/${pid}/tasks/${t11.id}/docs`, { docIds: [d1.id] })).status, 200);
  assert.equal((await api("owner", "PUT", `/api/desk/projects/${pid}/tasks/${t11.id}/docs`, { docIds: [999999999] })).status, 400);
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal(det.tasks.find((t: any) => t.id === t11.id).blockedByClient, true); // overdue doc blocks the task
  assert.ok(det.warnings.some((w: any) => w.code === "doc_overdue"));
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/docs/${d1.id}`, { status: "rechazado" })).status, 400); // needs a reason
  // the customer cannot see anything until the baseline is approved, so approve first
  for (const t of det.tasks.filter((t: any) => !t.clientSide)) await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t.id}`, { assigneeUserId: (await api("owner", "GET", "/api/desk/agents")).body.find((u: any) => u.username.startsWith("tmpt_owner")).id });
  const ap = await api("owner", "POST", `/api/desk/projects/${pid}/approve-plan`); assert.equal(ap.status, 200, JSON.stringify(ap.body));
  await portalLogin("adm", "adm@a.test"); await portalLogin("c1", "c1@a.test"); await portalLogin("cb", "cb@b.test");
  assert.equal((await papi("cb", "PATCH", `/api/portal/docs/${d1.id}`, { status: "recibido", files: ["x"] })).status, 404);
  assert.equal((await papi("c1", "PATCH", `/api/portal/docs/${d1.id}`, { status: "validado" })).status, 400); // customer cannot validate
  assert.equal((await papi("c1", "PATCH", `/api/portal/docs/${d1.id}`, { status: "recibido" })).status, 400); // needs a file/link
  assert.equal((await papi("c1", "PATCH", `/api/portal/docs/${d1.id}`, { status: "recibido", files: ["https://drive.example/layout.xlsx"], comment: "listo" })).status, 200);
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal(det.tasks.find((t: any) => t.id === t11.id).blockedByClient, false); // delivered: unblocked
  assert.equal(det.docs.find((d: any) => d.id === d1.id).status, "recibido");
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/docs/${d1.id}`, { status: "validado" })).status, 200);
  assert.equal((await papi("c1", "PATCH", `/api/portal/docs/${d1.id}`, { status: "parcial", files: ["otro"] })).status, 409); // the customer cannot regress a validated document

  // P-xx
  const p1 = (await api("owner", "POST", `/api/desk/projects/${pid}/decisions`, { question: "¿Formato de folio?", options: ["A", "B"], defaultDecision: "A", deadline: "2020-01-02" })).body;
  const p2 = (await api("owner", "POST", `/api/desk/projects/${pid}/decisions`, { question: "¿Moneda base?", defaultDecision: "MXN", deadline: "2099-01-02" })).body;
  assert.equal(p1.code, "P-01"); assert.equal(p2.code, "P-02");
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/decisions/${p2.id}/accept-default`)).status, 409); // not expired yet
  assert.equal((await papi("c1", "POST", `/api/portal/decisions/${p2.id}/decide`, { decision: "MXN" })).status, 404); // only account_admin
  assert.equal((await papi("adm", "POST", `/api/portal/decisions/${p2.id}/decide`, { decision: "USD" })).status, 200);
  assert.equal((await papi("adm", "POST", `/api/portal/decisions/${p2.id}/decide`, { decision: "MXN" })).status, 409); // already decided
  const p3 = (await api("owner", "POST", `/api/desk/projects/${pid}/decisions`, { question: "¿Sede de capacitación?", defaultDecision: "Cliente", deadline: "2099-02-02" })).body;
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/decisions/${p3.id}/decide`, { decision: "Proveedor" })).status, 400); // a proxy decision needs evidence
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/decisions/${p3.id}/decide`, { decision: "Proveedor", evidence: "Correo del director de TI del 10/11" })).status, 200);
  assert.equal(Number(((await db.execute(sql`SELECT count(*)::int n FROM sd_project_audit WHERE project_id = ${pid} AND action = 'decided_by_proxy'`)).rows as any[])[0].n), 1);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/decisions/${p1.id}/accept-default`)).status, 200);
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  const dd = det.decisions.find((d: any) => d.id === p1.id); assert.equal(dd.status, "defaulted"); assert.equal(dd.decision, "A");
  assert.equal(Number(((await db.execute(sql`SELECT count(*)::int n FROM sd_project_audit WHERE project_id = ${pid} AND action = 'defaulted'`)).rows as any[])[0].n), 1);

  // R-xx
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/risks`, { title: "Riesgo X", probability: 4, impact: 1 })).status, 400);
  const r1 = (await api("owner", "POST", `/api/desk/projects/${pid}/risks`, { title: "Rotación del equipo del cliente", probability: 3, impact: 3, mitigation: "Documentar", taskIds: [t11.id], shared: false })).body;
  const r2 = (await api("owner", "POST", `/api/desk/projects/${pid}/risks`, { title: "Retraso de proveedor", probability: 1, impact: 1, shared: true, mitigation: "Seguimiento semanal" })).body;
  assert.equal(r1.level, "high"); assert.equal(r2.code, "R-02");
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/risks`, { title: "Con tarea ajena", probability: 1, impact: 1, taskIds: [999999999] })).status, 400);

  // MOD-xx
  const m1 = (await api("owner", "POST", `/api/desk/projects/${pid}/modules`, { name: "Facturación" })).body; assert.equal(m1.code, "MOD-01");
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/modules/${m1.id}`, { status: "bogus" })).status, 400);
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/modules/${m1.id}`, { status: "released" })).status, 200);
  assert.deepEqual((await api("agentA", "GET", `/api/desk/accounts/${accA}/modules`)).body.map((m: any) => m.name), ["Facturación"]);
  assert.equal((await api("agentA", "GET", `/api/desk/accounts/${accB}/modules`)).status, 404);
  const tm = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "TMPT con módulo", channel: "manual", moduleArea: "facturación" })).body;
  assert.equal((((await db.execute(sql`SELECT module_area FROM sd_tickets WHERE id = ${tm.id}`)).rows as any[])[0]).module_area, "Facturación"); // canonical name from the catalog
  assert.deepEqual((await papi("c1", "GET", "/api/portal/modules")).body.map((m: any) => m.code), ["MOD-01"]);

  // payments: internal; gate comparison only for QSS
  const g0 = det.gates.find((g: any) => g.code === "G0");
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/payments`, { name: "Pago 1", amount: -5, dueDate: "2026-11-01" })).status, 400);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/payments`, { name: "Pago 1", amount: 1000, dueDate: "2000-01-01", gateId: g0.id, status: "paid" })).status, 201);
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.ok(det.warnings.some((w: any) => w.code === "payment_before_gate"));
  assert.equal(det.payments.length, 1);

  // load per resource (internal)
  const ld = await api("owner", "GET", `/api/desk/projects/${pid}/load`);
  assert.equal(ld.status, 200); assert.ok(ld.body.rows.length > 0 && ld.body.capacity === 40);

  // customer view: docs/decisions/modules yes; internal risks, payments, hours never
  const pv = await papi("c1", "GET", `/api/portal/projects/${pid}`);
  assert.equal(pv.status, 200);
  assert.deepEqual(pv.body.risks.map((r: any) => r.code), ["R-02"]);
  assert.ok(pv.body.docs.length === 2 && pv.body.decisions.length === 3 && pv.body.modules.length === 1);
  assert.equal(pv.body.payments.length, 0);
  assert.ok(!pv.raw.includes("Rotación del equipo") && !pv.raw.includes("warnings") && !pv.raw.includes("payment_before_gate") && !pv.raw.includes("1000"));
  // visibility changes are audited (RF-PRJ-19)
  await api("owner", "PATCH", `/api/desk/projects/${pid}/payments/${det.payments[0].id}`, { clientVisible: true });
  assert.equal((await papi("c1", "GET", `/api/portal/projects/${pid}`)).body.payments.length, 1);
  assert.equal(Number(((await db.execute(sql`SELECT count(*)::int n FROM sd_project_audit WHERE project_id = ${pid} AND action = 'visibility'`)).rows as any[])[0].n), 1);

  // handoff: signing the handoff gate starts the SLA; the close gate closes the project
  await db.execute(sql`UPDATE sd_projects SET pauses_sla = false WHERE account_id = ${accA} AND id <> ${pid}`); // other test projects must not hold the account in implementation
  const gh = det.gates.find((g: any) => g.kind === "handoff"), gc = det.gates.find((g: any) => g.kind === "close");
  assert.equal(gh.code, "G6"); assert.equal(gc.code, "G8");
  assert.equal((await papi("adm", "POST", `/api/portal/gates/${gh.id}/signoff`, { result: "no_go", note: "aún no" })).status, 200);
  assert.equal((await lc()).lifecycle, "implementation"); // No Go changes nothing
  assert.equal((await papi("adm", "POST", `/api/portal/gates/${gh.id}/signoff`, { result: "go" })).status, 200);
  const after = await lc(); assert.equal(after.lifecycle, "parallel"); assert.ok(after.sla_active_from);
  assert.equal((await api("owner", "GET", `/api/desk/projects/${pid}`)).body.project.status, "parallel");
  const sla2 = (await api("owner", "GET", `/api/desk/tickets/${tk.id}/sla`)).body;
  assert.equal(sla2.excludedReason, "lifecycle_implementation"); assert.ok(sla2.metrics.every((m: any) => m.state === "excluded")); // created while implementing: stays out of SLA
  const tk2 = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, instanceId: inst.id, type: "incident", title: "TMPT en paralelo", severity: "P2", channel: "manual" })).body;
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${tk2.id}/sla`)).body.excludedReason, "lifecycle_parallel"); // parallel = best effort by default
  await db.execute(sql`INSERT INTO sd_settings (key, value) VALUES ('project.parallelSla', '"own"') ON CONFLICT (key) DO UPDATE SET value = '"own"'`);
  const sla3 = (await api("owner", "GET", `/api/desk/tickets/${tk2.id}/sla`)).body; assert.equal(sla3.excludedReason, null); assert.ok(sla3.metrics.some((m: any) => m.state !== "excluded")); // own SLA during parallel
  await db.execute(sql`DELETE FROM sd_settings WHERE key = 'project.parallelSla'`);
  assert.equal((await papi("adm", "POST", `/api/portal/gates/${gc.id}/signoff`, { result: "go" })).status, 200);
  assert.equal((await lc()).lifecycle, "operation");
  assert.equal((await api("owner", "GET", `/api/desk/projects/${pid}`)).body.project.status, "closed");
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${tk.id}/sla`)).body.excludedReason, "lifecycle_implementation"); // closing the project does not revive tickets from the implementation era
  assert.equal((await api("owner", "GET", `/api/desk/tickets/${tk2.id}/sla`)).body.excludedReason, "lifecycle_parallel"); // created during best-effort parallel: not revived either

  // tick: reminders run without error (SMTP is not configured in tests: nothing is sent) and escalate overdue docs once
  const tick = await api("owner", "POST", "/api/internal/sla/tick", {});
  assert.ok([401, 404].includes(tick.status));
  const { projectTick } = await import("./projectItemService");
  await projectTick();
});

async function generateCutBefore(pid: number) {
  const { generateCut } = await import("./projectP2bService");
  try { await generateCut(pid, null, "2020-01-01"); return 200; } catch (e: any) { return e.status ?? 500; }
}

test("project P2b: change control, status cuts, schedule importer, CSV export", { skip: !run }, async () => {
  const { db } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const ag = (await api("owner", "GET", "/api/desk/agents")).body.find((u: any) => u.username.startsWith("tmpt_owner"));
  const c = await api("owner", "POST", "/api/desk/projects", { accountId: accA, name: "TMPT P2b", startDate: "2026-11-09", template: "generic", pauseSla: false });
  assert.equal(c.status, 201); const pid = c.body.id;
  let det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/cuts`)).status, 409); // no baseline yet
  for (const t of det.tasks.filter((t: any) => !t.clientSide)) await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t.id}`, { assigneeUserId: ag.id });
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/approve-plan`)).status, 200);
  await portalLogin("adm", "adm@a.test"); await portalLogin("c1", "c1@a.test"); await portalLogin("cb", "cb@b.test");

  // ---- change control ----
  const ft = (await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "feature_request", title: "TMPT Exportar a Excel en proyecto", channel: "manual" })).body;
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  const auto = det.changes.find((x: any) => x.ticketId === ft.id);
  assert.ok(auto && auto.status === "draft" && auto.code === "CC-01"); // a feature request in an account with an active plan becomes a change request
  assert.equal((await api("agentA", "POST", `/api/desk/projects/${pid}/changes`, { title: "No debe" })).status, 403);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/changes`, { title: "Reporte", daysImpact: 1.5 })).status, 400);
  const ch = (await api("owner", "POST", `/api/desk/projects/${pid}/changes`, { title: "Reporte de conciliación", hoursImpact: 16, costImpact: 8000, daysImpact: 3, taskSpec: { name: "Reporte de conciliación" } })).body;
  assert.equal(ch.code, "CC-02");
  assert.equal((await papi("adm", "POST", `/api/portal/changes/${ch.id}/decide`, { decision: "approve" })).status, 404); // drafts are not visible/decidable
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/changes/${ch.id}`, { costImpact: 9000 })).status, 200);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/changes/${ch.id}/apply`)).status, 409); // not approved by the customer
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/changes/${ch.id}/propose`)).status, 200);
  assert.equal((await api("owner", "PATCH", `/api/desk/projects/${pid}/changes/${ch.id}`, { costImpact: 1 })).status, 409); // a proposal is frozen
  const before = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  const pvc = await papi("c1", "GET", `/api/portal/projects/${pid}`);
  const seen = pvc.body.changes.find((x: any) => x.id === ch.id);
  assert.ok(seen && seen.costImpact === "9000" && seen.daysImpact === 3 && !("hoursImpact" in seen)); // customer sees days and cost, never hours
  assert.ok(!pvc.body.changes.some((x: any) => x.id === auto.id)); // drafts stay internal
  assert.equal((await papi("c1", "POST", `/api/portal/changes/${ch.id}/decide`, { decision: "approve" })).status, 404); // only account_admin
  assert.equal((await papi("cb", "POST", `/api/portal/changes/${ch.id}/decide`, { decision: "approve" })).status, 404);
  assert.equal((await papi("adm", "POST", `/api/portal/changes/${ch.id}/decide`, { decision: "reject" })).status, 400); // reason required
  assert.equal((await papi("adm", "POST", `/api/portal/changes/${ch.id}/decide`, { decision: "approve", note: "ok" })).status, 200);
  assert.equal((await papi("adm", "POST", `/api/portal/changes/${ch.id}/decide`, { decision: "approve" })).status, 409);
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal(det.project.baselineVersion, before.project.baselineVersion + 1); // only the approved change moved the plan, as a baseline revision
  assert.ok(det.tasks.some((t: any) => t.code === "CC-02" && t.days === 3));
  assert.equal(det.changes.find((x: any) => x.id === ch.id).status, "applied");
  assert.equal(det.revisions[det.revisions.length - 1].origin, "customer");
  assert.equal(det.changes.find((x: any) => x.id === auto.id).status, "draft"); // unapproved changes never touch the plan
  const ch2 = (await api("owner", "POST", `/api/desk/projects/${pid}/changes`, { title: "Cambio rechazable", daysImpact: 2 })).body;
  await api("owner", "POST", `/api/desk/projects/${pid}/changes/${ch2.id}/propose`);
  assert.equal((await papi("adm", "POST", `/api/portal/changes/${ch2.id}/decide`, { decision: "reject", note: "fuera de presupuesto" })).status, 200);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/changes/${ch2.id}/apply`)).status, 409);
  assert.equal((await api("owner", "GET", `/api/desk/projects/${pid}`)).body.project.baselineVersion, det.project.baselineVersion);

  // concurrency: a double click on "Aprobar" applies the change once; parallel date edits each leave their own revision
  const ch3 = (await api("owner", "POST", `/api/desk/projects/${pid}/changes`, { title: "Cambio con doble clic", daysImpact: 1, taskSpec: { name: "Tarea doble clic" } })).body;
  await api("owner", "POST", `/api/desk/projects/${pid}/changes/${ch3.id}/propose`);
  const vBefore = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body.project.baselineVersion;
  const dbl = await Promise.all([1, 2].map(() => papi("adm", "POST", `/api/portal/changes/${ch3.id}/decide`, { decision: "approve" })));
  assert.deepEqual(dbl.map((x) => x.status).sort(), [200, 409]);
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal(det.tasks.filter((t: any) => t.code === ch3.code).length, 1);
  assert.equal(det.project.baselineVersion, vBefore + 1);
  const t01 = det.tasks.find((t: any) => t.code === "0.1");
  const par = await Promise.all([3, 4].map((days) => api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { days, reason: `edición paralela ${days}`, origin: "qss" })));
  assert.ok(par.every((x) => x.status === 200), JSON.stringify(par.map((x) => x.body)));
  det = (await api("owner", "GET", `/api/desk/projects/${pid}`)).body;
  assert.equal(det.project.baselineVersion, vBefore + 3);
  assert.equal(new Set(det.revisions.map((r: any) => r.version)).size, det.revisions.length); // distinct versions, one revision per change
  await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { clientVisible: false });
  await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${t01.id}`, { clientVisible: true });
  assert.equal(Number(((await db.execute(sql`SELECT count(*)::int n FROM sd_project_audit WHERE project_id = ${pid} AND entity = 'task' AND action = 'visibility'`)).rows as any[])[0].n), 2);
  const hid = det.tasks.find((t: any) => t.code === "1.1");
  await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${hid.id}`, { clientVisible: false });
  const pvd = (await papi("c1", "GET", `/api/portal/projects/${pid}`)).body;
  assert.ok(!pvd.tasks.some((t: any) => (t.deps as number[]).includes(hid.id))); // hidden task ids never leak as dependencies
  await api("owner", "PATCH", `/api/desk/projects/${pid}/tasks/${hid.id}`, { clientVisible: true });

  // ---- status cuts ----
  const cut = await api("owner", "POST", `/api/desk/projects/${pid}/cuts`);
  assert.equal(cut.status, 201); assert.equal(cut.body.status, "draft");
  assert.equal((await api("agentA", "POST", `/api/desk/projects/${pid}/cuts`)).status, 403);
  assert.deepEqual((await papi("c1", "GET", `/api/portal/projects/${pid}/cuts`)).body, []); // drafts are internal
  assert.equal((await papi("c1", "GET", `/api/portal/cuts/${cut.body.id}`)).status, 404);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/cuts/${cut.body.id}/send`)).status, 409); // approve first
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/cuts/${cut.body.id}/approve`)).status, 200);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/cuts/${cut.body.id}/approve`)).status, 409);
  assert.equal((await api("owner", "POST", `/api/desk/projects/${pid}/cuts`)).status, 409); // approved cuts are immutable
  const lst = await papi("c1", "GET", `/api/portal/projects/${pid}/cuts`); assert.equal(lst.body.length, 1);
  const view = await papi("c1", "GET", `/api/portal/cuts/${cut.body.id}`);
  assert.equal(view.status, 200); assert.ok(view.body.html.includes("TMPT P2b") && !view.raw.includes("hours") && !view.body.html.includes("NOTA-INTERNA"));
  assert.equal((await papi("cb", "GET", `/api/portal/cuts/${cut.body.id}`)).status, 404);
  const sent = await api("owner", "POST", `/api/desk/projects/${pid}/cuts/${cut.body.id}/send`);
  assert.equal(sent.status, 200); assert.ok(sent.body.recipients >= 1);
  const { cutTick } = await import("./projectP2bService");
  assert.equal(await generateCutBefore(pid), 409); // a cut dated before the plan existed is refused
  const t1 = await cutTick(); const t2 = await cutTick(); assert.equal(t2.created, 0); assert.ok(t1.created >= 0);

  // ---- importer ----
  const csv = ["tipo,codigo,nombre,fase,responsable,inicio,fin,avance,notas,monto,fecha",
    "FASE,F0,Descubrimiento,,,,,,,,", "FASE,F1,Diseño,,,,,,,,",
    `TAREA,0.1,Levantamiento,F0,${ag.username},2026-11-09,2026-11-13,100,Ver DOC-01 y P-01,,`,
    "TAREA,1.1,Diseño,F1,Cliente,2026-11-16,2026-11-20,50,riesgo R-01 módulo MOD-01,,",
    "GATE,G0,Arranque,F0,,,,,,,2026-11-05", "PAGO,,Anticipo,,,,,,,50000,2026-10-12", "FERIADO,,Puente,,,2026-11-27,,,,,"].join("\n");
  assert.equal((await api("agentA", "POST", "/api/desk/project-import/preview", { accountId: accA, csv })).status, 403);
  const pre = await api("owner", "POST", "/api/desk/project-import/preview", { accountId: accA, csv });
  assert.equal(pre.status, 200); assert.equal(pre.body.errors.length, 0); assert.deepEqual([pre.body.tasks, pre.body.gates, pre.body.payments], [2, 1, 1]);
  assert.deepEqual(pre.body.refs.doc, ["DOC-01"]);
  const bad = await api("owner", "POST", "/api/desk/project-import", { accountId: accA, name: "TMPT Import malo", csv: csv + "\nTAREA,9.9,Sin fechas,F0,,,,0,,,", pauseSla: false });
  assert.equal(bad.status, 400); assert.match(bad.body.message, /error/); // no silent partial loads
  const imp = await api("owner", "POST", "/api/desk/project-import", { accountId: accA, name: "TMPT Importado", solutionType: "TMS", csv, pauseSla: false });
  assert.equal(imp.status, 201, JSON.stringify(imp.body));
  const id2 = imp.body.id; const d2 = (await api("owner", "GET", `/api/desk/projects/${id2}`)).body;
  assert.equal(d2.project.baselineVersion, 0); // a draft: importing never approves a baseline
  assert.equal(d2.tasks.length, 2); assert.equal(d2.payments.length, 1); assert.equal(d2.tasks.find((t: any) => t.code === "1.1").clientSide, true);
  assert.equal(d2.tasks.find((t: any) => t.code === "0.1").assigneeUserId, ag.id); // matched by username
  assert.deepEqual(d2.docs.map((d: any) => [d.code, d.clientVisible]), [["DOC-01", false]]); // stubs keep the original codes, hidden until reviewed
  assert.ok(d2.risks.some((r: any) => r.code === "R-01") && d2.modules.some((m: any) => m.code === "MOD-01") && d2.decisions.some((x: any) => x.code === "P-01"));
  assert.equal(d2.gates[0].date, "2026-11-05"); assert.ok(d2.warnings.some((w: any) => w.code === "phase_after_gate")); // the file's inconsistency is surfaced, not smoothed over
  assert.equal(Number(((await db.execute(sql`SELECT count(*)::int n FROM sd_holidays WHERE account_id = ${accA} AND date = '2026-11-27'`)).rows as any[])[0].n), 1);
  assert.deepEqual((await papi("c1", "GET", "/api/portal/projects")).body.map((p: any) => p.id).includes(id2), false); // not visible until the plan is approved
  // hidden/draft items never produce customer emails; placeholder modules are hidden from the customer
  const { projectTick } = await import("./projectItemService");
  await projectTick();
  const rem = (await db.execute(sql`SELECT (SELECT count(*)::int FROM sd_project_docs WHERE project_id = ${id2} AND last_reminder IS NOT NULL) d, (SELECT count(*)::int FROM sd_project_decisions WHERE project_id = ${id2} AND (notified_at IS NOT NULL OR status <> 'open')) p`)).rows as any[];
  assert.deepEqual([Number(rem[0].d), Number(rem[0].p)], [0, 0]); // the draft import's hidden overdue DOC/P were neither reminded nor auto-defaulted
  assert.ok(!(await papi("c1", "GET", "/api/portal/modules")).body.some((m: any) => m.name.includes("importado")));

  // ---- CSV export ----
  const ex = await api("owner", "GET", `/api/desk/projects/${pid}/export.csv`);
  assert.equal(ex.status, 200); assert.ok(ex.raw.includes("Horas"));
  const exc = await papi("c1", "GET", `/api/portal/projects/${pid}/export.csv`);
  assert.equal(exc.status, 200); assert.ok(!exc.raw.includes("Horas") && exc.raw.includes("Actividad"));
  assert.equal((await papi("cb", "GET", `/api/portal/projects/${pid}/export.csv`)).status, 404);
});

test("catalog: edit and delete with referential guards", { skip: !run }, async () => {
  const { db } = await import("../db");
  const s = await import("@shared/schema");
  const tag = Date.now().toString(36);
  // products: rename, role checks, delete only when unused
  const p = await api("owner", "POST", "/api/desk/products", { code: `TMPT-DEL-${tag}`, name: "TMPT borrable" });
  assert.equal(p.status, 201);
  const ren = await api("owner", "PUT", `/api/desk/products/${p.body.id}`, { code: p.body.code, name: "TMPT renombrado", active: false });
  assert.equal(ren.body.name, "TMPT renombrado");
  assert.equal((await api("l1", "DELETE", `/api/desk/products/${p.body.id}`)).status, 403);
  assert.equal((await api("agentA", "DELETE", `/api/desk/products/${p.body.id}`)).status, 403);
  const used = await api("owner", "DELETE", `/api/desk/products/${ids.product}`);
  assert.equal(used.status, 409); // used by contracts
  assert.match(used.body.message, /desact/i);
  assert.equal((await api("owner", "DELETE", `/api/desk/products/${p.body.id}`)).status, 200);
  assert.equal((await api("owner", "GET", "/api/desk/products")).body.some((x: any) => x.id === p.body.id), false);
  assert.equal((await api("owner", "DELETE", `/api/desk/products/${p.body.id}`)).status, 404);

  // accounts: only empty accounts can be deleted
  const [c] = await db.insert(s.clientes).values({ codigo: `TMPT-DEL-${tag}`, tipo: "Cliente", nombreNegocio: "TMPT borrable" }).returning();
  ids.clientes.push(c.id);
  const letters = tag.toUpperCase().replace(/[^A-Z]/g, "").padEnd(3, "Q").slice(0, 3);
  const acc = await api("owner", "POST", "/api/desk/accounts", { clienteId: c.id, accountType: "demo", ticketPrefix: `DX${letters}` });
  assert.equal(acc.status, 201, JSON.stringify(acc.body));
  ids.accounts.push(acc.body.id);
  const ct = await api("owner", "POST", "/api/desk/contacts", { accountId: acc.body.id, email: `tmpt-del-${tag}@x.test`, name: "Borrable" });
  assert.equal(ct.status, 201);
  assert.equal((await api("owner", "PUT", `/api/desk/contacts/${ct.body.id}`, { email: `tmpt-del-${tag}@x.test`, name: "Renombrado", role: "contact" })).body.name, "Renombrado");
  const blocked = await api("owner", "DELETE", `/api/desk/accounts/${acc.body.id}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /primero/i);
  assert.equal((await api("agentA", "DELETE", `/api/desk/accounts/${accA}`)).status, 403);
  assert.equal((await api("owner", "DELETE", `/api/desk/accounts/${accA}`)).status, 409); // has tickets/contacts
  assert.equal((await api("owner", "DELETE", `/api/desk/contacts/${ct.body.id}`)).status, 200);
  assert.equal((await api("owner", "DELETE", `/api/desk/accounts/${acc.body.id}`)).status, 200);
  assert.equal((await api("owner", "GET", "/api/desk/accounts")).body.some((x: any) => x.id === acc.body.id), false);
  assert.equal((await api("owner", "DELETE", `/api/desk/accounts/${acc.body.id}`)).status, 404);

  // instances: cannot be deleted while tickets point at them
  const inst = await api("owner", "POST", "/api/desk/instances", { accountId: accA, productId: ids.product, name: `TMPT inst ${tag}` });
  assert.equal(inst.status, 201);
  assert.equal((await api("owner", "PUT", `/api/desk/instances/${inst.body.id}`, { productId: ids.product, name: `TMPT inst ${tag} v2`, environment: "staging", baseUrl: "", active: true })).body.name, `TMPT inst ${tag} v2`);
  const t = await api("owner", "POST", "/api/desk/tickets", { accountId: accA, type: "question", title: "Usa instancia", channel: "manual", instanceId: inst.body.id });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  const det = (await api("owner", "GET", `/api/desk/tickets/${t.body.id}`)).body;
  assert.equal(det.instance.name, `TMPT inst ${tag} v2`); // the detail carries product/instance names for the copyable context
  assert.ok("product" in det);
  const guard = await api("owner", "DELETE", `/api/desk/instances/${inst.body.id}`);
  assert.equal(guard.status, 409);
  assert.match(guard.body.message, /desact/i);
  const free = await api("owner", "POST", "/api/desk/instances", { accountId: accA, productId: ids.product, name: `TMPT libre ${tag}` });
  assert.equal((await api("owner", "DELETE", `/api/desk/instances/${free.body.id}`)).status, 200);
});

test("tickets list: filters, sorting, pagination, search and summary", { skip: !run }, async () => {
  const mk = async (b: any) => { const r = await api("owner", "POST", "/api/desk/tickets", { accountId: accA, channel: "manual", ...b }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body; };
  const t1 = await mk({ type: "incident", title: "ZZLIST alfa", description: "falla en bodega norte", severity: "P1" });
  const t2 = await mk({ type: "question", title: "ZZLIST beta", channel: "email" });
  const t3 = await mk({ type: "service_request", title: "ZZLIST gamma", channel: "portal" });
  const t4 = await mk({ type: "incident", title: "ZZLIST delta", severity: "P3" });
  const agentId = ids.users[1];
  assert.equal((await api("owner", "PATCH", `/api/desk/tickets/${t1.id}`, { assigneeUserId: agentId })).status, 200);
  const list = async (qs: string) => { const r = await api("owner", "GET", `/api/desk/tickets?q=ZZLIST&${qs}`); assert.equal(r.status, 200, r.raw); return r.body; };
  const keys = (r: any) => r.rows.map((x: any) => x.key);

  // sorting
  assert.deepEqual(keys(await list("sort=created&dir=asc")), [t1.key, t2.key, t3.key, t4.key]);
  assert.deepEqual(keys(await list("sort=created&dir=desc")), [t4.key, t3.key, t2.key, t1.key]);
  assert.deepEqual(keys(await list("sort=title&dir=asc")), [t1.key, t2.key, t4.key, t3.key]); // alfa, beta, delta, gamma
  assert.equal(keys(await list("sort=severity&dir=asc"))[0], t1.key); // P1 before P3 before none
  assert.equal((await api("owner", "GET", "/api/desk/tickets?sort=bogus")).status, 400);
  assert.equal((await api("owner", "GET", "/api/desk/tickets?dir=sideways")).status, 400);

  // filters
  assert.deepEqual(keys(await list("severity=P1")), [t1.key]);
  assert.deepEqual(keys(await list("severity=P0,P1")), [t1.key]); // several at once: "Críticos"
  assert.deepEqual(keys(await list("severity=P1,P3&sort=created&dir=asc")), [t1.key, t4.key]);
  assert.deepEqual(keys(await list("severity=P3,none&sort=created&dir=asc")), [t2.key, t3.key, t4.key]); // none = no severity yet
  assert.equal((await api("owner", "GET", "/api/desk/tickets?severity=P9")).status, 400);
  assert.deepEqual(keys(await list("severity=none&sort=created&dir=asc")), [t2.key, t3.key]);
  assert.deepEqual(keys(await list("channel=email")), [t2.key]);
  assert.deepEqual(keys(await list(`assignee=${agentId}`)), [t1.key]);
  assert.deepEqual(keys(await list("assignee=none&sort=created&dir=asc")), [t2.key, t3.key, t4.key]);
  assert.equal((await list("noResponse=1")).total, 4);
  assert.equal((await api("owner", "POST", `/api/desk/tickets/${t2.id}/comments`, { body: "Hola, lo revisamos", visibility: "public" })).status, 201);
  assert.ok(!keys(await list("noResponse=1")).includes(t2.key));
  assert.equal((await list("productId=999999999")).total, 0);
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), yesterday = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10); // 2 days: UTC and Mexico City can differ by a calendar day
  assert.equal((await list(`createdFrom=${tomorrow}`)).total, 0);
  assert.equal((await list(`createdTo=${yesterday}`)).total, 0);
  assert.equal((await list(`createdFrom=${yesterday}&createdTo=${tomorrow}`)).total, 4);
  assert.equal((await api("owner", "GET", "/api/desk/tickets?createdFrom=not-a-date")).status, 400);

  // search: title, description and client name
  const r = await api("owner", "GET", "/api/desk/tickets?q=bodega%20norte");
  assert.deepEqual(keys(r.body), [t1.key]);
  assert.ok(keys((await api("owner", "GET", "/api/desk/tickets?q=TMPT%20A&limit=200")).body).includes(t3.key));

  // pagination keeps total and does not repeat rows
  const p1 = await list("sort=created&dir=asc&limit=2&offset=0"), p2 = await list("sort=created&dir=asc&limit=2&offset=2");
  assert.equal(p1.total, 4); assert.equal(p2.total, 4);
  assert.deepEqual([...keys(p1), ...keys(p2)], [t1.key, t2.key, t3.key, t4.key]);

  // row shape for the friendlier list
  const row = (await list(`assignee=${agentId}`)).rows[0];
  assert.equal(row.channel, "manual");
  assert.ok(typeof row.assigneeName === "string" && row.assigneeName.length > 0);
  assert.ok("createdAt" in row && "firstResponseAt" in row);

  // summary chips are scoped like the list
  const sum = await api("owner", "GET", "/api/desk/tickets/summary");
  assert.equal(sum.status, 200);
  assert.ok(sum.body.open >= 4 && sum.body.unassigned >= 3 && sum.body.critical >= 1 && sum.body.noResponse >= 3);
  assert.equal(typeof sum.body.mine, "number");
  const sumA = await api("agentA", "GET", "/api/desk/tickets/summary");
  assert.ok(sumA.body.open >= 4);
  assert.equal((await api("nobody", "GET", "/api/desk/tickets/summary")).body.open, 0);
});
