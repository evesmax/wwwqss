import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveScope, canAccessAccount, hasRole, type Actor } from "./access";

const actor = (assignments: any[], roles: string[] = ["agent_l2"]): Actor => ({
  userId: 1, roles, scope: resolveScope(assignments),
});

test("no assignments sees nothing", () => {
  assert.equal(canAccessAccount(actor([]), 1, [1, 2]), false);
});
test("global sees everything", () => {
  assert.equal(canAccessAccount(actor([{ scopeType: "global", scopeId: null }]), 99, []), true);
});
test("account scope is exact", () => {
  const a = actor([{ scopeType: "account", scopeId: 5 }]);
  assert.equal(canAccessAccount(a, 5, []), true);
  assert.equal(canAccessAccount(a, 6, []), false);
});
test("product scope matches accounts having that product", () => {
  const a = actor([{ scopeType: "product", scopeId: 2 }]);
  assert.equal(canAccessAccount(a, 9, [1, 2]), true);
  assert.equal(canAccessAccount(a, 9, [1, 3]), false);
});
test("malformed assignment (null scopeId) grants nothing", () => {
  assert.equal(canAccessAccount(actor([{ scopeType: "account", scopeId: null }]), 1, []), false);
});
test("hasRole", () => {
  assert.equal(hasRole(actor([], ["owner"]), "owner", "support_manager"), true);
  assert.equal(hasRole(actor([], ["agent_l1"]), "owner"), false);
});

import { assignSchema } from "./routes";
test("owner and support_manager can only be granted with global scope", () => {
  const ok = (a: any) => assignSchema.safeParse({ assignments: [a] }).success;
  assert.equal(ok({ role: "owner", scopeType: "global", scopeId: null }), true);
  assert.equal(ok({ role: "owner", scopeType: "account", scopeId: 5 }), false);
  assert.equal(ok({ role: "support_manager", scopeType: "product", scopeId: 2 }), false);
  assert.equal(ok({ role: "agent_l2", scopeType: "account", scopeId: 5 }), true);
});
