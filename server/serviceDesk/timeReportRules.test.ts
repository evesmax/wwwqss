import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeReport, costOf, type TimeRow } from "./timeReportRules";

const r = (o: Partial<TimeRow>): TimeRow => ({ minutes: 60, agentKeyId: null, workDate: "2026-11-10", ticketId: 1, key: "AMZ-0001", title: "T", type: "incident", accountId: 1, productId: 10, ...o });
const names = { accounts: new Map([[1, "Amazon"], [2, "Otra"]]), products: new Map([[10, "Inventia"], [11, "Nexus"]]) };

test("costOf converts minutes to money at the hourly rate", () => {
  assert.equal(costOf(90, 400), 600);
  assert.equal(costOf(0, 400), 0);
});

test("buildTimeReport splits human vs agent and groups by account/product/type", () => {
  const rep = buildTimeReport([
    r({ minutes: 60 }), r({ minutes: 30, agentKeyId: 5 }),
    r({ minutes: 120, ticketId: 2, key: "OTR-0001", accountId: 2, productId: 11, type: "feature_request" }),
  ], names, 400);
  assert.deepEqual(rep.totals, { minutes: 210, humanMinutes: 180, agentMinutes: 30, cost: 1400, tickets: 2, entries: 3 });
  assert.equal(rep.byAccount[0].name, "Otra");
  assert.equal(rep.byAccount[1].tickets, 1);
  assert.equal(rep.byProduct.find((b) => b.name === "Inventia")!.agentMinutes, 30);
  assert.equal(rep.byType.find((b) => b.id === "feature_request")!.cost, 800);
  assert.equal(rep.byAccountProduct.length, 2);
  assert.equal(rep.timeline.length, 1);
});

test("empty report has zero totals", () => {
  const rep = buildTimeReport([], names, 400);
  assert.equal(rep.totals.cost, 0); assert.deepEqual(rep.byAccount, []);
});
