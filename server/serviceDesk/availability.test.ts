import test from "node:test";
import assert from "node:assert/strict";
import { computeAvailability, monthRange, classifyMinute, dailyStatus, type Probe } from "./availability";

const MIN = 60_000;
const t0 = Date.UTC(2026, 10, 10, 6, 0, 0); // 2026-11-10 00:00 Mexico City
const p = (m: number, loc: string, ok: boolean): Probe => ({ minute: t0 + m * MIN, location: loc, ok });

test("minute is down only when 2+ distinct locations fail", () => {
  assert.equal(classifyMinute([{ location: "a", ok: false }, { location: "b", ok: false }]), "down");
  assert.equal(classifyMinute([{ location: "a", ok: false }, { location: "b", ok: true }]), "up");
  assert.equal(classifyMinute([{ location: "a", ok: false }]), "unconfirmed");
  assert.equal(classifyMinute([{ location: "a", ok: false }, { location: "a", ok: false }]), "unconfirmed");
  assert.equal(classifyMinute([{ location: "a", ok: true }]), "up");
  assert.equal(classifyMinute([]), "nodata");
});
test("availability: 100 - down/minutes, no data reported apart", () => {
  const probes: Probe[] = [];
  for (let m = 0; m < 100; m++) { probes.push(p(m, "a", m >= 10 && m < 15 ? false : true), p(m, "b", m >= 10 && m < 15 ? false : true)); }
  const r = computeAvailability({ fromMs: t0, toMs: t0 + 200 * MIN, nowMs: t0 + 100 * MIN, probes, maintenance: [] });
  assert.equal(r.elapsedMinutes, 100);
  assert.equal(r.downMinutes, 5);
  assert.equal(r.noDataMinutes, 0);
  assert.equal(r.pct, 95);
});
test("only elapsed minutes count; future minutes are ignored", () => {
  const r = computeAvailability({ fromMs: t0, toMs: t0 + 1000 * MIN, nowMs: t0 + 10 * MIN, probes: [p(0, "a", true), p(0, "b", true)], maintenance: [] });
  assert.equal(r.elapsedMinutes, 10);
  assert.equal(r.noDataMinutes, 9);
});
test("missing data is reported, not counted as down; coverage shown", () => {
  const probes = [p(0, "a", true), p(0, "b", true), p(1, "a", true), p(1, "b", true)];
  const r = computeAvailability({ fromMs: t0, toMs: t0 + 10 * MIN, nowMs: t0 + 10 * MIN, probes, maintenance: [] });
  assert.equal(r.downMinutes, 0);
  assert.equal(r.noDataMinutes, 8);
  assert.equal(r.pct, 100);
  assert.equal(r.coverage, 0.2);
  assert.equal(computeAvailability({ fromMs: t0, toMs: t0 + 10 * MIN, nowMs: t0 + 10 * MIN, probes: [], maintenance: [] }).pct, null);
});
test("maintenance minutes are excluded from the calculation and reported apart", () => {
  const probes: Probe[] = [];
  for (let m = 0; m < 60; m++) { const down = m >= 20 && m < 30; probes.push(p(m, "a", !down), p(m, "b", !down)); }
  const r = computeAvailability({ fromMs: t0, toMs: t0 + 60 * MIN, nowMs: t0 + 60 * MIN, probes, maintenance: [{ startMs: t0 + 20 * MIN, endMs: t0 + 30 * MIN }] });
  assert.equal(r.downMinutes, 0);
  assert.equal(r.maintenanceMinutes, 10);
  assert.equal(r.pct, 100);
  assert.equal(r.downMinutesInMaintenance, 10);
});
test("duplicate probes for a location and minute do not double count", () => {
  const r = computeAvailability({ fromMs: t0, toMs: t0 + 2 * MIN, nowMs: t0 + 2 * MIN, probes: [p(0, "a", false), p(0, "a", false), p(0, "b", true)], maintenance: [] });
  assert.equal(r.downMinutes, 0);
});
test("monthRange uses America/Mexico_City boundaries", () => {
  const { fromMs, toMs } = monthRange(2026, 11, "America/Mexico_City");
  assert.equal(new Date(fromMs).toISOString(), "2026-11-01T06:00:00.000Z");
  assert.equal(new Date(toMs).toISOString(), "2026-12-01T06:00:00.000Z");
  assert.equal(new Date(monthRange(2026, 12, "America/Mexico_City").toMs).toISOString(), "2027-01-01T06:00:00.000Z");
});
test("dailyStatus buckets by local day: operational / degraded / outage / nodata", () => {
  assert.equal(dailyStatus({ elapsedMinutes: 1440, downMinutes: 0, noDataMinutes: 0 }), "operational");
  assert.equal(dailyStatus({ elapsedMinutes: 1440, downMinutes: 10, noDataMinutes: 0 }), "degraded");
  assert.equal(dailyStatus({ elapsedMinutes: 1440, downMinutes: 200, noDataMinutes: 0 }), "outage");
  assert.equal(dailyStatus({ elapsedMinutes: 1440, downMinutes: 0, noDataMinutes: 1440 }), "nodata");
});
