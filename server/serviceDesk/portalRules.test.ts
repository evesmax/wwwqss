import { test } from "node:test";
import assert from "node:assert/strict";
import { canContactSeeTicket } from "./portalRules";

const t = (o: object = {}) => ({ accountId: 1, requesterContactId: 10, sharedWithAccount: false, ...o });
test("requester sees own ticket", () => assert.equal(canContactSeeTicket([{ id: 10, accountId: 1, role: "contact" }], t()), true));
test("other contact of same account does not, unless shared", () => {
  const me = [{ id: 11, accountId: 1, role: "contact" }];
  assert.equal(canContactSeeTicket(me, t()), false);
  assert.equal(canContactSeeTicket(me, t({ sharedWithAccount: true })), true);
});
test("account_admin sees all of its account only", () => {
  const me = [{ id: 11, accountId: 1, role: "account_admin" }];
  assert.equal(canContactSeeTicket(me, t()), true);
  assert.equal(canContactSeeTicket(me, t({ accountId: 2 })), false);
});
test("never across accounts even if shared", () => assert.equal(canContactSeeTicket([{ id: 10, accountId: 2, role: "contact" }], t({ sharedWithAccount: true })), false));
test("no contacts, nothing", () => assert.equal(canContactSeeTicket([], t()), false));
