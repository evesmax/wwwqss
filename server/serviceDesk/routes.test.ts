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
let accA = 0, accB = 0;

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
  if (ids.accounts.length) await db.delete(s.sdAccounts).where(inArray(s.sdAccounts.id, ids.accounts));
  if (ids.clientes.length) await db.delete(s.clientes).where(inArray(s.clientes.id, ids.clientes));
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
