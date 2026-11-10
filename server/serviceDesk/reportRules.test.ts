import test from "node:test";
import assert from "node:assert/strict";
import { percentile, buildReport, renderReportHtml, type ReportInput } from "./reportRules";

const H = 3_600_000;
const d = (s: string) => new Date(`${s}-06:00`);
const base = (o: Partial<ReportInput> = {}): ReportInput => ({
  account: "Cliente Demo", period: { year: 2026, month: 10, fromMs: +d("2026-10-01T00:00"), toMs: +d("2026-11-01T00:00") }, generatedAt: d("2026-11-03T08:00"),
  tickets: [], availability: [], incidents: [], maintenanceUpcoming: [], hoursMinutes: 0, hoursBankMinutes: null, ...o,
});
const tk = (id: number, o: any = {}) => ({ id, key: `T-${id}`, title: `Ticket ${id}`, type: "incident", severity: "P2", status: "closed", createdAt: d("2026-10-05T10:00"), resolvedAt: d("2026-10-06T10:00"),
  slaApplicable: true, exclusionReason: null, reopenedInPeriod: false, rcaCause: null, sla: { first_response: { state: "met", elapsedMs: 1 * H, stoppedAt: d("2026-10-05T11:00") }, resolution: { state: "met", elapsedMs: 9 * H, stoppedAt: d("2026-10-06T10:00") } }, ...o });

test("percentile: nearest-rank; empty -> null", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 90), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  assert.equal(percentile([10, 1, 5], 50), 5);
});
test("empty period never imputes 100%: everything is N/D", () => {
  const r = buildReport(base());
  assert.equal(r.sla.compliancePct, null);
  assert.equal(r.availability.pct, null);
  assert.equal(r.hours.consumedHours, 0);
  assert.equal(r.hours.bankHours, null);
  assert.equal(r.csat.value, null);
  assert.ok(r.notes.some((n) => n.includes("N/D")));
});
test("SLA compliance counts only applicable tickets stopped in period, plus open breached", () => {
  const r = buildReport(base({ tickets: [
    tk(1), tk(2, { sla: { first_response: { state: "breached", elapsedMs: 9 * H, stoppedAt: d("2026-10-05T20:00") }, resolution: { state: "met", elapsedMs: 5 * H, stoppedAt: d("2026-10-06T10:00") } } }),
    tk(3, { slaApplicable: false, exclusionReason: "imported" }),
    tk(4, { slaApplicable: false, exclusionReason: "third_party_declared" }),
    tk(5, { status: "in_progress", resolvedAt: null, sla: { first_response: { state: "met", elapsedMs: H, stoppedAt: d("2026-10-05T11:00") }, resolution: { state: "breached", elapsedMs: 99 * H, stoppedAt: null } } }),
  ] }));
  assert.equal(r.sla.metrics.first_response.total, 3);
  assert.equal(r.sla.metrics.first_response.met, 2);
  assert.equal(r.sla.metrics.resolution.total, 3);
  assert.equal(r.sla.metrics.resolution.met, 2);
  assert.equal(r.sla.compliancePct, Math.round((4 / 6) * 1000) / 10);
  assert.equal(r.sla.exclusions.length, 1);
  assert.equal(r.sla.exclusions[0].reason, "third_party_declared");
  assert.equal(r.sla.breaches.length, 2);
  assert.equal(r.sla.withoutTimestamps, 1);
  assert.ok(r.notes.some((n) => n.includes("histórico")));
});
test("median and p90 per severity, resolution in hours", () => {
  const r = buildReport(base({ tickets: [1, 2, 3, 4, 5].map((i) => tk(i, { severity: "P1", sla: { first_response: { state: "met", elapsedMs: i * H, stoppedAt: d("2026-10-05T11:00") }, resolution: { state: "met", elapsedMs: i * 2 * H, stoppedAt: d("2026-10-06T10:00") } } })) }));
  const p1 = r.sla.bySeverity.find((x) => x.severity === "P1")!;
  assert.equal(p1.firstResponse.medianHours, 3);
  assert.equal(p1.resolution.p90Hours, 10);
});
test("tickets section: opened/closed by type, backlog age, reopened", () => {
  const r = buildReport(base({ tickets: [
    tk(1), tk(2, { type: "question", severity: null }),
    tk(3, { status: "in_progress", resolvedAt: null, createdAt: d("2026-08-01T10:00") }),
    tk(4, { createdAt: d("2026-09-10T10:00"), resolvedAt: d("2026-10-02T10:00"), reopenedInPeriod: true }),
    tk(5, { type: "internal_task" }),
  ] }));
  assert.equal(r.tickets.opened, 2);                 // created in period (internal_task excluded)
  assert.equal(r.tickets.closed, 3);                 // resolved/closed in period: 1, 2, 4
  assert.equal(r.tickets.reopened, 1);
  assert.equal(r.tickets.byType.incident.opened, 1);
  assert.equal(r.tickets.backlog.over30, 1);
  assert.equal(r.tickets.list.length, 4);
  assert.ok(!r.tickets.list.some((x) => x.key === "T-5"));
});
test("availability aggregates per component; N/D when no data; maintenance and incidents with RCA", () => {
  const r = buildReport(base({
    availability: [{ name: "Plataforma", instance: "Planta 1", pct: 99.5, downMinutes: 200, maintenanceMinutes: 30, coverage: 1 }, { name: "API", instance: "Planta 1", pct: null, downMinutes: 0, maintenanceMinutes: 0, coverage: 0 }],
    incidents: [{ title: "Caída parcial", startedAt: d("2026-10-10T10:00"), resolvedAt: d("2026-10-10T12:00"), impact: "major", rca: { cause: "DB", fix: "x", prevention: "y" } }],
  }));
  assert.equal(r.availability.components[1].pct, null);
  assert.equal(r.availability.pct, 99.5);
  assert.equal(r.availability.incidents[0].rca!.cause, "DB");
  assert.ok(r.notes.some((n) => n.includes("API")));
});
test("hours consumed vs bank with balance; features delivered", () => {
  const r = buildReport(base({ hoursMinutes: 12 * 60, hoursBankMinutes: 40 * 60, tickets: [tk(1, { type: "feature_request", severity: null, status: "released" }), tk(2, { type: "feature_request", severity: null, status: "in_development", resolvedAt: null })] }));
  assert.equal(r.hours.consumedHours, 12);
  assert.equal(r.hours.bankHours, 40);
  assert.equal(r.hours.balanceHours, 28);
  assert.equal(r.features.delivered.length, 1);
  assert.equal(r.features.inProgress.length, 1);
});
test("HTML renderer escapes content, shows N/D and glossary", () => {
  const r = buildReport(base({ tickets: [tk(1, { title: "<script>alert(1)</script>" })] }));
  const html = renderReportHtml(r, { logoUrl: "https://x/logo.png", portalUrl: "https://x/portal" });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("N/D"));
  assert.ok(html.includes("Glosario"));
  assert.ok(html.includes("octubre de 2026"));
  assert.ok(html.includes("https://x/portal"));
});
