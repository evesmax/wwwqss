import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePrefix, registerSchema } from "./sdkProvision";

test("derivePrefix takes the first letters, ignoring accents and symbols", () => {
  assert.equal(derivePrefix("Transportes Ñandú S.A.", new Set()), "TRA");
  assert.equal(derivePrefix("Él 99", new Set()), "ELX");
});
test("derivePrefix widens then varies when taken, always 2-6 letters", () => {
  assert.equal(derivePrefix("Transportes", new Set(["TRA"])), "TRAN");
  assert.equal(derivePrefix("Transportes", new Set(["TRA", "TRAN", "TRANS", "TRANSP"])), "TRB");
  assert.match(derivePrefix("", new Set()), /^[A-Z]{2,6}$/);
});
test("registerSchema requires business and contact names", () => {
  assert.equal(registerSchema.safeParse({ businessName: "A", contactName: "Juan" }).success, false);
  assert.equal(registerSchema.safeParse({ businessName: "Mi Negocio", contactName: "Juan" }).success, true);
});
