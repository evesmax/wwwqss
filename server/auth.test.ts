import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./auth";
import { LoginThrottle } from "./loginThrottle";

test("verifyPassword accepts correct, rejects wrong and malformed", () => {
  const h = hashPassword("s3cret-pass");
  assert.equal(verifyPassword("s3cret-pass", h), true);
  assert.equal(verifyPassword("nope", h), false);
  assert.equal(verifyPassword("x", "garbage"), false);
  assert.equal(verifyPassword("x", ""), false);
  assert.equal(verifyPassword("x", "aa:zz"), false);
});

test("throttle blocks after 5 failures, expires after 15 min, resets on success", () => {
  let t = 0;
  const th = new LoginThrottle(() => t);
  for (let i = 0; i < 4; i++) th.recordFailure("k");
  assert.equal(th.isBlocked("k"), false);
  th.recordFailure("k");
  assert.equal(th.isBlocked("k"), true);
  t += 15 * 60_000 + 1;
  assert.equal(th.isBlocked("k"), false);
  for (let i = 0; i < 5; i++) th.recordFailure("k");
  th.reset("k");
  assert.equal(th.isBlocked("k"), false);
});
