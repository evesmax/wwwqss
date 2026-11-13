import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, sumUsage } from "./effort.js";
import { DEFAULT_PRICES, detectProduct, parseTicketRef } from "./config.js";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";

const L = (id: string, ts: string, out: number, model = "claude-sonnet-5-5") =>
  JSON.stringify({ type: "assistant", timestamp: ts, message: { id, model, usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 } } });

test("sumUsage suma desde la marca y deduplica por id", () => {
  const u = sumUsage([L("a", "2026-11-13T10:00:00Z", 5), L("a", "2026-11-13T10:00:01Z", 5), L("b", "2026-11-13T11:00:00Z", 7), L("old", "2026-11-12T10:00:00Z", 99), "basura"], new Date("2026-11-13T09:00:00Z"));
  assert.deepEqual([u.input, u.output, u.cacheRead, u.cacheWrite], [20, 12, 200, 10]);
  assert.match(u.model, /sonnet/);
});
test("estimateCost usa la tabla y devuelve null sin modelo conocido", () => {
  const c = estimateCost({ input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0, model: "claude-sonnet-5-5" }, DEFAULT_PRICES);
  assert.equal(c, 18);
  assert.equal(estimateCost({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, model: "otro" }, DEFAULT_PRICES), null);
});
test("parseTicketRef acepta folio e id, rechaza basura", () => {
  assert.equal(parseTicketRef("nex-0012"), "NEX-0012"); assert.equal(parseTicketRef("42"), "42");
  assert.throws(() => parseTicketRef("../x"));
});
test("detectProduct busca hacia arriba", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "qd-")); fs.mkdirSync(path.join(d, "a/b"), { recursive: true });
  fs.writeFileSync(path.join(d, ".qss-desk.json"), '{"product":"nexus"}');
  assert.equal(detectProduct(path.join(d, "a/b")), "nexus");
  assert.equal(detectProduct(os.tmpdir() + "/__nada__"), null);
});
