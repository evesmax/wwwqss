import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSecret, parseAgentToken } from "./agentAuth";

const id = "qa_" + "a".repeat(16), sec = "b".repeat(64);
test("parseAgentToken acepta el formato válido", () => {
  assert.deepEqual(parseAgentToken(`Bearer ${id}.${sec}`), { keyId: id, secret: sec });
});
test("parseAgentToken rechaza formatos inválidos", () => {
  for (const h of [undefined, "", "Bearer", `Bearer ${id}`, `Bearer ${id}.short`, `Basic ${id}.${sec}`, `Bearer qk_${"a".repeat(16)}.${sec}`]) assert.equal(parseAgentToken(h), null);
});
test("hashSecret es determinista y no devuelve el secreto", () => {
  assert.equal(hashSecret(sec), hashSecret(sec));
  assert.notEqual(hashSecret(sec), sec);
  assert.equal(hashSecret(sec).length, 64);
});
