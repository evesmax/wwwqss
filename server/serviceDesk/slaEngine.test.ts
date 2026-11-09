import test from "node:test";
import assert from "node:assert/strict";
import { computeTicketSla, derivePauses, selectPolicy, type SlaEvent, type Policy } from "./slaEngine";
import { defaultBusinessCalendar, mxOfficialHolidays, type Calendar } from "./slaCalendar";

const H = 3_600_000;
const mx = (iso: string) => new Date(`${iso}-06:00`);
const cal = (extra: string[] = []): Calendar => ({ ...defaultBusinessCalendar(), holidays: [...mxOfficialHolidays(2026), ...extra] });
const P1: Policy = { id: 1, name: "P1", firstResponseMin: 4 * 60, updateMin: 4 * 60, resolutionMin: 8 * 60 };
const P3: Policy = { id: 2, name: "P3", firstResponseMin: 16 * 60, updateMin: null, resolutionMin: 36 * 60 };
const ev = (at: string, kind: string, detail: Record<string, unknown> = {}, actorType = "user"): SlaEvent => ({ at: mx(at), kind, actorType, detail });
const created = (at: string) => ev(at, "created", {}, "contact");
const st = (at: string, to: string, from = "in_progress", reason: string | null = null, actorType = "user") => ev(at, "status_changed", { from, to, reason }, actorType);
const base = (events: SlaEvent[], now: string, policy = P1, c = cal(), createdAt?: string, extra: object = {}) => {
  const t = createdAt ?? "2026-11-04T10:00";
  return computeTicketSla({ ticket: { type: "incident", severity: "P1", slaApplicable: true, createdAt: mx(t), ...extra }, events, policy, calendar: c, now: mx(now) });
};
const m = (r: ReturnType<typeof base>, key: string) => r.metrics.find((x) => x.key === key)!;

test("first response met within target; stops the clock", () => {
  const r = base([created("2026-11-04T10:00"), ev("2026-11-04T11:30", "first_response")], "2026-11-05T10:00");
  const f = m(r, "first_response");
  assert.equal(f.state, "met");
  assert.equal(f.elapsedMs, 1.5 * H);
});
test("first response running, at risk at 75%, breached after target", () => {
  const e = [created("2026-11-04T10:00")];
  assert.equal(m(base(e, "2026-11-04T11:00"), "first_response").state, "running");
  assert.equal(m(base(e, "2026-11-04T13:30"), "first_response").state, "at_risk");
  const b = m(base(e, "2026-11-04T14:30"), "first_response");
  assert.equal(b.state, "breached");
  assert.equal(b.remainingMs, 0);
  assert.equal(b.dueAt!.getTime(), mx("2026-11-04T14:00").getTime());
});
test("created after hours: clock starts next business morning", () => {
  const e = [created("2026-11-04T20:00")];
  const f = m(base(e, "2026-11-05T10:00", P1, cal(), "2026-11-04T20:00"), "first_response");
  assert.equal(f.elapsedMs, 1 * H);
  assert.equal(f.dueAt!.getTime(), mx("2026-11-05T13:00").getTime());
});
test("weekend does not count", () => {
  const e = [created("2026-11-06T17:00")];
  const f = m(base(e, "2026-11-09T10:00", P1, cal(), "2026-11-06T17:00"), "first_response");
  assert.equal(f.elapsedMs, 2 * H);
});
test("holiday does not count", () => {
  const e = [created("2026-11-13T17:00")];
  const f = m(base(e, "2026-11-17T10:00", P1, cal(), "2026-11-13T17:00"), "first_response");
  assert.equal(f.elapsedMs, 2 * H);
});
test("waiting_customer pauses resolution; multiple pauses", () => {
  const e = [created("2026-11-04T09:00"), st("2026-11-04T10:00", "waiting_customer"), st("2026-11-04T12:00", "in_progress", "waiting_customer"),
    st("2026-11-04T14:00", "waiting_customer"), st("2026-11-05T09:00", "in_progress", "waiting_customer")];
  const r = base(e, "2026-11-05T10:00", P1, cal(), "2026-11-04T09:00");
  const res = m(r, "resolution");
  // active: 09-10 (1h) + 12-14 (2h) + Nov 4 14-18 is paused, Nov5 09-10 (1h) = 4h
  assert.equal(res.elapsedMs, 4 * H);
  assert.equal(res.pauses.length, 2);
  assert.equal(res.pauses[0].reason, "waiting_customer");
});
test("waiting_third_party pauses only with reason", () => {
  const withReason = [created("2026-11-04T09:00"), st("2026-11-04T10:00", "waiting_third_party", "in_progress", "Proveedor de hosting")];
  const noReason = [created("2026-11-04T09:00"), st("2026-11-04T10:00", "waiting_third_party", "in_progress", null)];
  assert.equal(m(base(withReason, "2026-11-04T12:00", P1, cal(), "2026-11-04T09:00"), "resolution").elapsedMs, 1 * H);
  assert.equal(m(base(noReason, "2026-11-04T12:00", P1, cal(), "2026-11-04T09:00"), "resolution").elapsedMs, 3 * H);
});
test("pause reason is exposed for the customer view", () => {
  const e = [created("2026-11-04T09:00"), st("2026-11-04T10:00", "waiting_third_party", "in_progress", "Proveedor de hosting")];
  const p = m(base(e, "2026-11-04T12:00", P1, cal(), "2026-11-04T09:00"), "resolution");
  assert.equal(p.paused, true);
  assert.equal(p.pauses[0].note, "Proveedor de hosting");
  assert.equal(p.pauses[0].to, null);
});
test("resolution met when resolved within target; resolved time is not counted", () => {
  const e = [created("2026-11-04T09:00"), st("2026-11-04T15:00", "resolved")];
  const res = m(base(e, "2026-11-10T10:00", P1, cal(), "2026-11-04T09:00"), "resolution");
  assert.equal(res.state, "met");
  assert.equal(res.elapsedMs, 6 * H);
});
test("reopen continues the clock; time while resolved does not count", () => {
  const e = [created("2026-11-04T09:00"), st("2026-11-04T12:00", "resolved"), st("2026-11-05T09:00", "in_progress", "resolved"), ];
  const res = m(base(e, "2026-11-05T14:00", P1, cal(), "2026-11-04T09:00"), "resolution");
  // 3h before resolve + 5h after reopen = 8h = exactly the target -> still running, 100% used
  assert.equal(res.elapsedMs, 8 * H);
  assert.equal(res.state, "at_risk");
  const later = m(base(e, "2026-11-05T14:30", P1, cal(), "2026-11-04T09:00"), "resolution");
  assert.equal(later.state, "breached");
});
test("closed after resolved keeps the original stop", () => {
  const e = [created("2026-11-04T09:00"), st("2026-11-04T12:00", "resolved"), st("2026-11-06T12:00", "closed", "resolved")];
  const res = m(base(e, "2026-11-20T12:00", P1, cal(), "2026-11-04T09:00"), "resolution");
  assert.equal(res.state, "met");
  assert.equal(res.elapsedMs, 3 * H);
});
test("severity change mid-life: current policy applies to elapsed since creation", () => {
  const e = [created("2026-11-04T09:00")];
  const asP1 = m(base(e, "2026-11-04T14:00", P1, cal(), "2026-11-04T09:00"), "first_response");
  const asP3 = m(base(e, "2026-11-04T14:00", P3, cal(), "2026-11-04T09:00"), "first_response");
  assert.equal(asP1.state, "breached");
  assert.equal(asP3.state, "running");
  assert.equal(asP1.elapsedMs, asP3.elapsedMs);
});
test("calendar change is applied retroactively and deterministically", () => {
  const e = [created("2026-11-04T09:00")];
  const a = base(e, "2026-11-05T09:00", P1, cal(["2026-11-04"]), "2026-11-04T09:00");
  const b = base(e, "2026-11-05T09:00", P1, cal(), "2026-11-04T09:00");
  assert.equal(m(a, "first_response").elapsedMs, 0);
  assert.equal(m(b, "first_response").elapsedMs, 9 * H);
  assert.deepEqual(base(e, "2026-11-05T09:00", P1, cal(), "2026-11-04T09:00"), b);
});
test("24x7 calendar counts nights and weekends", () => {
  const f = m(base([created("2026-11-07T00:00")], "2026-11-07T03:00", P1, { kind: "24x7" }, "2026-11-07T00:00"), "first_response");
  assert.equal(f.elapsedMs, 3 * H);
});
test("periodic update (P1): breached when no public update in the interval", () => {
  const e = [created("2026-11-04T09:00"), ev("2026-11-04T10:00", "first_response"), ev("2026-11-04T10:00", "comment", { visibility: "public" })];
  assert.equal(m(base(e, "2026-11-04T12:00", P1, cal(), "2026-11-04T09:00"), "update").state, "running");
  assert.equal(m(base(e, "2026-11-04T15:00", P1, cal(), "2026-11-04T09:00"), "update").state, "breached");
  const e2 = [...e, ev("2026-11-04T13:30", "comment", { visibility: "public" })];
  assert.equal(m(base(e2, "2026-11-04T15:00", P1, cal(), "2026-11-04T09:00"), "update").state, "running");
});
test("internal notes and contact comments do not reset the update clock", () => {
  const e = [created("2026-11-04T09:00"), ev("2026-11-04T10:00", "comment", { visibility: "public" }), ev("2026-11-04T12:00", "comment", { visibility: "internal" }), ev("2026-11-04T12:30", "comment", { visibility: "public" }, "contact")];
  assert.equal(m(base(e, "2026-11-04T15:00", P1, cal(), "2026-11-04T09:00"), "update").state, "breached");
});
test("no update metric when policy has no updateMin", () => {
  assert.equal(base([created("2026-11-04T09:00")], "2026-11-04T10:00", P3).metrics.some((x) => x.key === "update"), false);
});
test("cancelled/rejected tickets are cancelled, not breached", () => {
  const e = [created("2026-11-04T09:00"), st("2026-11-04T09:30", "cancelled", "new", "Duplicado")];
  assert.equal(m(base(e, "2026-11-30T09:00", P1, cal(), "2026-11-04T09:00"), "first_response").state, "cancelled");
});
test("excluded when slaApplicable is false", () => {
  const r = base([created("2026-11-04T09:00")], "2026-11-30T09:00", P1, cal(), "2026-11-04T09:00", { slaApplicable: false });
  assert.ok(r.metrics.every((x) => x.state === "excluded"));
});
test("first response metric stops when the ticket is resolved without a response", () => {
  const e = [created("2026-11-04T09:00"), st("2026-11-04T09:30", "resolved")];
  const f = m(base(e, "2026-11-30T09:00", P1, cal(), "2026-11-04T09:00"), "first_response");
  assert.equal(f.state, "met");
});
test("derivePauses ignores events out of order by using given order stably", () => {
  const d = derivePauses([created("2026-11-04T09:00"), st("2026-11-04T10:00", "waiting_customer"), st("2026-11-04T11:00", "in_progress", "waiting_customer")]);
  assert.equal(d.pauses.length, 1);
  assert.equal(d.pauses[0].to!.getTime(), mx("2026-11-04T11:00").getTime());
});
test("selectPolicy: first match wins; empty filter matches anything; none -> null", () => {
  const ps: (Policy & { filters: any })[] = [
    { id: 1, name: "a", firstResponseMin: 1, updateMin: null, resolutionMin: 1, filters: { severities: ["P0"] } },
    { id: 2, name: "b", firstResponseMin: 1, updateMin: null, resolutionMin: 1, filters: { plans: ["suscripcion"], types: ["incident"] } },
    { id: 3, name: "c", firstResponseMin: 1, updateMin: null, resolutionMin: 1, filters: {} },
  ];
  const t = (o: object) => ({ type: "incident", severity: "P2", accountId: 1, productId: 1, plan: "suscripcion", ...o });
  assert.equal(selectPolicy(ps, t({ severity: "P0" }))!.id, 1);
  assert.equal(selectPolicy(ps, t({}))!.id, 2);
  assert.equal(selectPolicy(ps, t({ plan: "demo" }))!.id, 3);
  assert.equal(selectPolicy(ps.slice(0, 2), t({ plan: "demo" })), null);
});
test("public comment after resolving does not count as an update breach", () => {
  const e = [created("2026-11-04T09:00"), ev("2026-11-04T10:00", "comment", { visibility: "public" }), st("2026-11-04T10:10", "resolved"), ev("2026-11-06T10:00", "comment", { visibility: "public" })];
  const u = m(base(e, "2026-11-07T10:00", P1, cal(), "2026-11-04T09:00"), "update");
  assert.equal(u.state, "met");
  assert.equal(u.breaches, 0);
});
