import test from "node:test";
import assert from "node:assert/strict";
import { workingMs, addWorkingMs, mxOfficialHolidays, defaultBusinessCalendar, type Calendar } from "./slaCalendar";

const MIN = 60_000, HOUR = 60 * MIN;
const cal = (holidays: string[] = []): Calendar => ({ ...defaultBusinessCalendar(), holidays });
// Mexico City is UTC-6 all year since 2022: 09:00 local = 15:00Z.
const mx = (iso: string) => new Date(`${iso}-06:00`);

test("24x7 counts every ms", () => {
  assert.equal(workingMs({ kind: "24x7" }, mx("2026-11-07T10:00"), mx("2026-11-09T10:00")), 48 * HOUR);
});
test("business hours inside one day", () => {
  assert.equal(workingMs(cal(), mx("2026-11-04T10:00"), mx("2026-11-04T12:30")), 2.5 * HOUR);
});
test("outside hours counts zero; clipped to window", () => {
  assert.equal(workingMs(cal(), mx("2026-11-04T19:00"), mx("2026-11-04T23:00")), 0);
  assert.equal(workingMs(cal(), mx("2026-11-04T07:00"), mx("2026-11-04T10:00")), 1 * HOUR);
});
test("weekend skipped (Fri 17:00 -> Mon 10:00 = 1h + 1h)", () => {
  assert.equal(workingMs(cal(), mx("2026-11-06T17:00"), mx("2026-11-09T10:00")), 2 * HOUR);
});
test("holiday skipped", () => {
  // Mon 2026-11-16 is the Revolution holiday (third Monday of November).
  const h = mxOfficialHolidays(2026);
  assert.ok(h.includes("2026-11-16"));
  assert.equal(workingMs(cal(h), mx("2026-11-13T17:00"), mx("2026-11-17T10:00")), 2 * HOUR);
});
test("account holiday skipped", () => {
  assert.equal(workingMs(cal(["2026-11-04"]), mx("2026-11-04T09:00"), mx("2026-11-05T10:00")), 1 * HOUR);
});
test("addWorkingMs created after hours starts next business morning", () => {
  const d = addWorkingMs(cal(), mx("2026-11-04T20:00"), 2 * HOUR);
  assert.equal(d.getTime(), mx("2026-11-05T11:00").getTime());
});
test("addWorkingMs spans weekend", () => {
  const d = addWorkingMs(cal(), mx("2026-11-06T16:00"), 4 * HOUR);
  assert.equal(d.getTime(), mx("2026-11-09T11:00").getTime());
});
test("addWorkingMs 0 returns start of next working time", () => {
  assert.equal(addWorkingMs(cal(), mx("2026-11-07T12:00"), 0).getTime(), mx("2026-11-09T09:00").getTime());
});
test("addWorkingMs and workingMs are inverse", () => {
  const from = mx("2026-11-05T15:20");
  const due = addWorkingMs(cal(mxOfficialHolidays(2026)), from, 30 * HOUR);
  assert.equal(workingMs(cal(mxOfficialHolidays(2026)), from, due), 30 * HOUR);
});
test("timezone: another zone shifts the window", () => {
  const c: Calendar = { kind: "business", tz: "America/Bogota", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", holidays: [] };
  // Bogota UTC-5: 09:00 local = 14:00Z
  assert.equal(workingMs(c, new Date("2026-11-04T14:00:00Z"), new Date("2026-11-04T16:00:00Z")), 2 * HOUR);
  assert.equal(workingMs(c, new Date("2026-11-04T10:00:00Z"), new Date("2026-11-04T13:00:00Z")), 0);
});
test("DST zone keeps local window (America/New_York)", () => {
  const c: Calendar = { kind: "business", tz: "America/New_York", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", holidays: [] };
  // 2026-03-09 is after spring-forward (EDT, UTC-4): 09:00 = 13:00Z; 2026-03-06 EST: 09:00 = 14:00Z
  assert.equal(workingMs(c, new Date("2026-03-09T13:00:00Z"), new Date("2026-03-09T21:00:00Z")), 8 * HOUR);
  assert.equal(workingMs(c, new Date("2026-03-06T14:00:00Z"), new Date("2026-03-06T22:00:00Z")), 8 * HOUR);
});
test("mexican official holidays 2026 and 2030", () => {
  assert.deepEqual(mxOfficialHolidays(2026), ["2026-01-01", "2026-02-02", "2026-03-16", "2026-05-01", "2026-09-16", "2026-11-16", "2026-12-25"]);
  assert.ok(mxOfficialHolidays(2030).includes("2030-10-01"));
  assert.ok(!mxOfficialHolidays(2026).includes("2026-10-01"));
});
