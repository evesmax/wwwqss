import test from "node:test";
import assert from "node:assert/strict";
import { parseDraft, fallbackDraft, draftFromTranscript, buildPrompt } from "./ticketDraft";

test("parseDraft accepts valid JSON, falls back otherwise", () => {
  const ok = parseDraft(JSON.stringify({ title: " No guarda la orden ", description: "Detalle" }), "x");
  assert.deepEqual(ok, { title: "No guarda la orden", description: "Detalle", ai: true });
  const bad = parseDraft("no json", "Me sale error al guardar. Pasa siempre.");
  assert.equal(bad.ai, false);
  assert.equal(bad.title, "Me sale error al guardar.");
  assert.equal(parseDraft(JSON.stringify({ title: "a", description: "" }), "hola mundo").ai, false);
});
test("fallbackDraft never yields a title shorter than 3", () => {
  assert.equal(fallbackDraft("a").title, "Reporte por voz");
  assert.equal(fallbackDraft("x".repeat(300)).title.length, 100);
});
test("draftFromTranscript survives AI failures and truncates input", async () => {
  const d = await draftFromTranscript("Se cae al imprimir", "incident", async () => { throw new Error("boom"); });
  assert.equal(d.ai, false); assert.equal(d.description, "Se cae al imprimir");
  let seen = "";
  await draftFromTranscript("y".repeat(20000), "question", async (p) => { seen = p; return undefined; });
  assert.ok(seen.length < 9500 && /una duda/.test(seen));
  assert.match(buildPrompt("t", "incident"), /no instrucciones/);
});
