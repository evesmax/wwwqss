import test from "node:test";
import assert from "node:assert/strict";
import { validateMonitorUrl, autoIncidentAction, noticeOk } from "./monitorRules";

test("monitor URL: https only, no private targets or credentials", () => {
  assert.equal(validateMonitorUrl("https://app.cliente.com/health/deep").ok, true);
  for (const bad of ["http://app.cliente.com/h", "https://localhost/h", "https://127.0.0.1/h", "https://10.0.0.5/h", "https://169.254.169.254/latest", "https://192.168.1.1/",
    "https://172.16.0.1/", "https://user:pw@app.cliente.com/", "https://metadata.google.internal/", "https://intranet/", "ftp://x.com", "no-url", "https://[::1]/"])
    assert.equal(validateMonitorUrl(bad).ok, false, bad);
});
test("auto incident opens after 3 down minutes, resolves after 5 up minutes", () => {
  assert.equal(autoIncidentAction(["up", "down", "down"], false), "none");
  assert.equal(autoIncidentAction(["down", "down", "down"], false), "open");
  assert.equal(autoIncidentAction(["down", "down", "down"], true), "none");
  assert.equal(autoIncidentAction(["up", "up", "up", "up", "down"], true), "none");
  assert.equal(autoIncidentAction(["up", "up", "up", "up", "up"], true), "resolve");
  assert.equal(autoIncidentAction(["unconfirmed", "down", "down", "down"], false), "open");
  assert.equal(autoIncidentAction(["nodata", "down", "down"], false), "none");
});
test("maintenance needs 48h notice to be excluded", () => {
  const c = new Date("2026-11-10T12:00:00Z");
  assert.equal(noticeOk(c, new Date("2026-11-12T12:00:00Z")), true);
  assert.equal(noticeOk(c, new Date("2026-11-12T11:59:00Z")), false);
});
