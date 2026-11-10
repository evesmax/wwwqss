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
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: jars[who] ?? "" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null, raw: text };
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
