import test from "node:test";
import assert from "node:assert/strict";
import { isBusinessDay, addBusinessDays, businessDaysBetween, scheduleTasks, plannedPct, projectProgress, statusFor, validateProject, signoffHash, validateSignoff } from "./projectRules";

const H = new Set<string>(["2026-12-25"]);
test("business days skip weekends and holidays", () => {
  assert.equal(isBusinessDay("2026-11-07", H), false); // Saturday
  assert.equal(isBusinessDay("2026-12-25", H), false);
  assert.equal(isBusinessDay("2026-11-09", H), true);
  assert.equal(addBusinessDays("2026-11-09", 0, H), "2026-11-09");
  assert.equal(addBusinessDays("2026-11-13", 1, H), "2026-11-16"); // Fri -> Mon
  assert.equal(addBusinessDays("2026-12-24", 1, H), "2026-12-28"); // skips holiday + weekend
  assert.equal(addBusinessDays("2026-11-07", 0, H), "2026-11-09"); // non-business start rolls forward
  assert.equal(businessDaysBetween("2026-11-09", "2026-11-13", H), 5); // inclusive
  assert.equal(businessDaysBetween("2026-11-13", "2026-11-16", H), 2);
});
test("schedule: finish-to-start, fixed starts, duration in business days", () => {
  const r = scheduleTasks([
    { id: 1, days: 3, deps: [] }, { id: 2, days: 2, deps: [1] }, { id: 3, days: 1, deps: [1, 2] }, { id: 4, days: 1, deps: [], fixedStart: "2026-11-18" },
  ], "2026-11-09", H);
  assert.deepEqual(r.get(1), { start: "2026-11-09", end: "2026-11-11" });
  assert.deepEqual(r.get(2), { start: "2026-11-12", end: "2026-11-13" });
  assert.deepEqual(r.get(3), { start: "2026-11-16", end: "2026-11-16" });
  assert.deepEqual(r.get(4), { start: "2026-11-18", end: "2026-11-18" });
});
test("schedule: cycles are rejected", () => {
  assert.throws(() => scheduleTasks([{ id: 1, days: 1, deps: [2] }, { id: 2, days: 1, deps: [1] }], "2026-11-09", H), /ciclo/i);
  assert.throws(() => scheduleTasks([{ id: 1, days: 1, deps: [9] }], "2026-11-09", H), /no existe/i);
});
test("planned percent is linear over business days of the baseline", () => {
  const t = { start: "2026-11-09", end: "2026-11-13" };
  assert.equal(plannedPct(t, "2026-11-06", H), 0);
  assert.equal(plannedPct(t, "2026-11-11", H), 0.6); // 3 of 5 days elapsed (inclusive of cut day)
  assert.equal(plannedPct(t, "2026-11-13", H), 1);
  assert.equal(plannedPct(t, "2026-12-01", H), 1);
});
test("progress weighted by hours, falling back to days; blocked-by-client reported apart", () => {
  const tasks = [
    { id: 1, hours: 10, days: 5, pct: 100, start: "2026-11-09", end: "2026-11-13", internal: true, blockedByClient: false },
    { id: 2, hours: 30, days: 5, pct: 0, start: "2026-11-16", end: "2026-11-20", internal: true, blockedByClient: false },
    { id: 3, hours: null, days: 2, pct: 0, start: "2026-11-09", end: "2026-11-10", internal: false, blockedByClient: true },
  ];
  const p = projectProgress(tasks, "2026-11-13", H);
  // weights: 10 + 30 + (no hours -> days 2 scaled? tasks without hours use days only when NO task has hours)
  assert.equal(p.weightBasis, "hours");
  assert.equal(p.actual, 25); // 10/40
  assert.equal(p.planned, 25); // task1 100% planned, task2 0
  assert.equal(p.blockedByClient, 1);
  const q = projectProgress(tasks.map((t) => ({ ...t, hours: null })), "2026-11-13", H);
  assert.equal(q.weightBasis, "days");
});
test("status thresholds and overdue gate floor", () => {
  assert.equal(statusFor(50, 50, false), "on_track");
  assert.equal(statusFor(46, 50, false), "on_track"); // 0.92
  assert.equal(statusFor(40, 50, false), "at_risk"); // 0.80
  assert.equal(statusFor(30, 50, false), "late"); // 0.60
  assert.equal(statusFor(50, 50, true), "at_risk"); // overdue unsigned gate
  assert.equal(statusFor(30, 50, true), "late");
  assert.equal(statusFor(0, 0, false), "on_track");
  assert.equal(statusFor(10, 0, false), "on_track");
});
test("validations (RF-PRJ-15)", () => {
  const w = validateProject({
    today: "2026-11-20", holidays: H,
    phases: [{ id: 1, end: "2026-11-30", gateId: 10 }],
    gates: [{ id: 10, date: "2026-11-27", signed: false }],
    tasks: [
      { id: 1, name: "a", phaseId: 1, start: "2026-11-09", end: "2026-11-12", deps: [], internal: true, assignee: null, hours: null, pct: 0, done: false },
      { id: 2, name: "b", phaseId: 1, start: "2026-11-10", end: "2026-11-13", deps: [1], internal: true, assignee: 5, hours: 8, pct: 100, done: true },
      { id: 3, name: "c", phaseId: 1, start: "2026-12-25", end: "2026-12-25", deps: [], internal: false, assignee: null, hours: null, pct: 0, done: false },
    ],
  });
  const codes = w.map((x) => x.code).sort();
  assert.ok(codes.includes("phase_after_gate"));
  assert.ok(codes.includes("starts_before_dep"));
  assert.ok(codes.includes("internal_no_assignee"));
  assert.ok(codes.includes("internal_no_hours"));
  assert.ok(codes.includes("on_holiday"));
  assert.ok(codes.includes("overdue_no_progress"));
  assert.ok(!w.some((x) => x.taskId === 2 && x.code === "overdue_no_progress")); // done
});
test("gate signoff: fingerprint is stable and changes with criteria/evidence; Go conditional needs a note", () => {
  const a = signoffHash({ gateId: 1, criteria: ["x", "y"], evidence: ["f1"] });
  assert.equal(a, signoffHash({ gateId: 1, criteria: ["x", "y"], evidence: ["f1"] }));
  assert.notEqual(a, signoffHash({ gateId: 1, criteria: ["x", "z"], evidence: ["f1"] }));
  assert.notEqual(a, signoffHash({ gateId: 1, criteria: ["x", "y"], evidence: ["f1", "f2"] }));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(validateSignoff("go", "").ok, true);
  assert.equal(validateSignoff("conditional", "").ok, false);
  assert.equal(validateSignoff("no_go", "falta X").ok, true);
  assert.equal(validateSignoff("no_go", "").ok, false);
  assert.equal(validateSignoff("maybe" as any, "x").ok, false);
});
