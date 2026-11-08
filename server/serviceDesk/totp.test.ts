import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSync } from "otplib";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";

test("accepts current token", () => {
  const s = generateTotpSecret();
  assert.equal(verifyTotp(s, generateSync({ secret: s })), true);
});
test("rejects wrong token", () => {
  assert.equal(verifyTotp(generateTotpSecret(), "000000"), false);
});
test("accepts 30s old, rejects 90s old", () => {
  const s = generateTotpSecret();
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyTotp(s, generateSync({ secret: s, epoch: now - 30 })), true);
  assert.equal(verifyTotp(s, generateSync({ secret: s, epoch: now - 90 })), false);
});
test("uri has issuer QSS", () => {
  const u = totpUri(generateTotpSecret(), "a@b.c");
  assert.ok(u.startsWith("otpauth://totp/"));
  assert.ok(u.includes("QSS"));
});
