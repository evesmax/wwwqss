import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEffortNote } from "./agentRoutes";

test("formatEffortNote incluye tokens, total y costo", () => {
  const t = formatEffortNote({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, model: "m", costUsd: 0.5, durationMin: 12.34, note: "" }, "mac");
  assert.match(t, /^\[ESFUERZO-IA\]/);
  assert.match(t, /total 165/);
  assert.match(t, /0\.5000/);
  assert.match(t, /12\.3/);
});
test("formatEffortNote omite costo y duración nulos", () => {
  const t = formatEffortNote({ inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, model: "", costUsd: null, durationMin: null, note: "" }, "mac");
  assert.doesNotMatch(t, /costo|duración/);
});
