import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "./crypto";

process.env.SESSION_SECRET ||= "test-secret";

test("roundtrip", () => assert.equal(decryptSecret(encryptSecret("abc ñ 123")), "abc ñ 123"));
test("random iv", () => assert.notEqual(encryptSecret("x"), encryptSecret("x")));
test("tampered blob throws", () => {
  const [iv, tag, enc] = encryptSecret("secret").split(":");
  const bad = Buffer.from(enc, "base64"); bad[0] ^= 1;
  assert.throws(() => decryptSecret([iv, tag, bad.toString("base64")].join(":")));
});
test("blob never contains plaintext", () => assert.ok(!encryptSecret("hunter2-password").includes("hunter2")));
