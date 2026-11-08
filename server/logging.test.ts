import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldLogBody } from "./logging";

test("response bodies of auth and admin-user endpoints are never logged", () => {
  assert.equal(shouldLogBody("/api/auth/mfa/setup"), false);
  assert.equal(shouldLogBody("/api/auth/login"), false);
  assert.equal(shouldLogBody("/api/admin/users"), false);
  assert.equal(shouldLogBody("/api/admin/users/3"), false);
  assert.equal(shouldLogBody("/api/desk/settings/smtp"), false);
  assert.equal(shouldLogBody("/api/catalog/clientes"), true);
});
