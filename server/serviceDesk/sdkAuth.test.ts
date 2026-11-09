import test from "node:test";
import assert from "node:assert/strict";
import { signJwt, verifyJwt, sanitizeContext, originAllowed, RateLimiter } from "./sdkAuth";

const S = "s3cret-s3cret-s3cret-s3cret";
const now = 1_800_000_000;
const claims = (o: object = {}) => ({ sub: "u1", email: "ana@cliente.com", name: "Ana", tenant: "Planta 1", iat: now - 5, exp: now + 300, ...o });

test("valid token verifies and exposes claims + kid", () => {
  const r = verifyJwt(signJwt(claims(), S, "qk_1"), () => S, now);
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.claims.email, "ana@cliente.com"); assert.equal(r.kid, "qk_1"); }
});
test("rejects tampering, wrong secret, alg none, expired, too long-lived, missing kid/claims", () => {
  const good = signJwt(claims(), S, "qk_1");
  const [h, p, s] = good.split(".");
  const forged = Buffer.from(JSON.stringify(claims({ email: "evil@x.com" }))).toString("base64url");
  assert.equal(verifyJwt(`${h}.${forged}.${s}`, () => S, now).ok, false);
  assert.equal(verifyJwt(good, () => "other-secret-other-secret-other", now).ok, false);
  const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: "qk_1" })).toString("base64url")}.${p}.`;
  assert.equal(verifyJwt(none, () => S, now).ok, false);
  assert.equal(verifyJwt(signJwt(claims({ exp: now - 1 }), S, "qk_1"), () => S, now).ok, false);
  assert.equal(verifyJwt(signJwt(claims({ exp: now + 3600 }), S, "qk_1"), () => S, now).ok, false);
  assert.equal(verifyJwt(signJwt(claims({ iat: now + 600 }), S, "qk_1"), () => S, now).ok, false);
  assert.equal(verifyJwt(signJwt(claims({ email: "" }), S, "qk_1"), () => S, now).ok, false);
  assert.equal(verifyJwt(signJwt(claims({ email: "no-es-correo" }), S, "qk_1"), () => S, now).ok, false);
  assert.equal(verifyJwt(signJwt(claims({ sub: "" }), S, "qk_1"), () => S, now).ok, false);
  assert.equal(verifyJwt(good, () => null, now).ok, false); // unknown key id
  assert.equal(verifyJwt("a.b", () => S, now).ok, false);
  assert.equal(verifyJwt("", () => S, now).ok, false);
});
test("sanitizeContext trims, caps and drops unknown fields", () => {
  const c = sanitizeContext({ url: "https://x.com/a?token=abc#h", userAgent: "UA".repeat(500), appVersion: "1.2.3", viewport: "1200x800", locale: "es-MX",
    consoleErrors: Array.from({ length: 50 }, (_, i) => "err" + i + "x".repeat(1000)), evil: "<script>", nested: { a: 1 } } as any);
  assert.ok(!("evil" in c) && !("nested" in c));
  assert.ok(c.userAgent!.length <= 300);
  assert.equal(c.consoleErrors!.length, 20);
  assert.ok(c.consoleErrors![0].length <= 500);
  assert.equal(c.url, "https://x.com/a"); // query and hash stripped: may carry tokens
  assert.deepEqual(sanitizeContext(null as any), {});
});
test("originAllowed: exact match, empty list denies, wildcard never allowed implicitly", () => {
  assert.equal(originAllowed("https://app.cliente.com", ["https://app.cliente.com"]), true);
  assert.equal(originAllowed("https://evil.com", ["https://app.cliente.com"]), false);
  assert.equal(originAllowed("https://app.cliente.com", []), false);
  assert.equal(originAllowed(undefined, ["https://app.cliente.com"]), false);
  assert.equal(originAllowed("https://app.cliente.com.evil.com", ["https://app.cliente.com"]), false);
});
test("RateLimiter allows N per window then blocks, then recovers", () => {
  const rl = new RateLimiter(2, 1000);
  assert.equal(rl.hit("k", 0), true); assert.equal(rl.hit("k", 10), true); assert.equal(rl.hit("k", 20), false);
  assert.equal(rl.hit("other", 20), true);
  assert.equal(rl.hit("k", 1500), true);
});
