import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "./emailService";

const cfg = { host: "h", port: 587, secure: false, user: "u", password: "SECRET-PW", fromName: "QSS", fromEmail: "a@b.c" };
const rows: any[] = [];
const log = async (r: any) => { rows.push(r); };
const mail = { to: ["x@y.z", "w@y.z"], subject: "s", html: "<p>h</p>" };

test("sent", async () => {
  let got: any;
  const r = await sendEmail(mail, { getConfig: async () => cfg, makeTransport: () => ({ sendMail: async (o) => { got = o; } }), log });
  assert.equal(r.status, "sent");
  assert.equal(got.to, "x@y.z, w@y.z");
  assert.equal(got.from, '"QSS" <a@b.c>');
  assert.equal(rows.at(-1).status, "sent");
});
test("not configured does not throw and logs", async () => {
  const r = await sendEmail(mail, { getConfig: async () => null, log });
  assert.equal(r.status, "not_configured");
  assert.equal(rows.at(-1).status, "not_configured");
});
test("failure is captured and logged without password", async () => {
  const r = await sendEmail(mail, { getConfig: async () => cfg, makeTransport: () => ({ sendMail: async () => { throw new Error("boom"); } }), log });
  assert.equal(r.status, "failed");
  assert.equal(rows.at(-1).error, "boom");
  assert.ok(!JSON.stringify(rows).includes("SECRET-PW"));
});
test("log failure does not break sending", async () => {
  const r = await sendEmail(mail, { getConfig: async () => null, log: async () => { throw new Error("db down"); } });
  assert.equal(r.status, "not_configured");
});
