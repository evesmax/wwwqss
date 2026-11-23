import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCreate, checkTransition, normalizePermissions, visibleProductIds } from "./agentPermissions";

test("checkTransition: sin permisos bloquea terminales y liberar; permite estados intermedios", () => {
  for (const to of ["closed", "rejected", "cancelled", "duplicate", "resolved", "released"]) assert.ok(checkTransition([], to), to);
  for (const to of ["in_progress", "triage", "waiting_customer", "waiting_third_party", "in_review", "planned"]) assert.equal(checkTransition([], to), null, to);
});
test("checkTransition: los permisos explícitos habilitan cada grupo por separado", () => {
  assert.equal(checkTransition(["transition_terminal"], "closed"), null);
  assert.ok(checkTransition(["transition_terminal"], "resolved"));
  assert.equal(checkTransition(["release"], "resolved"), null);
  assert.ok(checkTransition(["release"], "closed"));
});
test("checkCreate: solo PLATAFORMAQSS, origen transversal/negocio y tipos permitidos", () => {
  const ok = { perms: ["create_ticket"], productCode: "PLATAFORMAQSS", origin: "transversal", type: "internal_task" };
  assert.equal(checkCreate(ok), null);
  assert.ok(checkCreate({ ...ok, perms: [] }));
  assert.ok(checkCreate({ ...ok, productCode: "INVENTIA" }));
  assert.ok(checkCreate({ ...ok, productCode: null }));
  assert.ok(checkCreate({ ...ok, origin: "cliente" }));
  assert.ok(checkCreate({ ...ok, type: "feature_request" }));
});
test("normalizePermissions descarta valores desconocidos", () => {
  assert.deepEqual(normalizePermissions(["release", "root", 3]), ["release"]);
  assert.deepEqual(normalizePermissions(null), []);
});
test("visibleProductIds: all_products = todos los activos; si no, la lista explícita", () => {
  assert.deepEqual(visibleProductIds({ allProducts: true, productIds: [1] }, [1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(visibleProductIds({ allProducts: false, productIds: [1, "x", 2] }, [1, 2, 3]), [1, 2]);
});
