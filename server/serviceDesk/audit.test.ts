import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { sanitizeDetail } from "./audit";

test("sanitizeDetail strips sensitive keys recursively", () => {
  assert.deepEqual(sanitizeDetail({ password: "x", nested: { token: "y", ok: 1 }, list: [{ secret: 1, a: 2 }] }),
    { nested: { ok: 1 }, list: [{ a: 2 }] });
});

const hasDb = process.env.RUN_DB_TESTS === "1";
class Rollback extends Error {}

test("audit rows are append-only (trigger)", { skip: !hasDb }, async () => {
  const { db } = await import("../db");
  const { writeAudit } = await import("./audit");
  await assert.rejects(db.transaction(async (tx) => {
    await writeAudit({ actorUserId: null, action: "test", entity: "t", entityId: "1", detail: { password: "p", ok: 1 } }, tx as any);
    await assert.rejects(tx.execute(sql`UPDATE sd_audit_log SET action='x' WHERE entity='t'`), /append-only/);
    throw new Rollback();
  }), Rollback);
});

test("audit insert stores sanitized detail", { skip: !hasDb }, async () => {
  const { db } = await import("../db");
  const { writeAudit } = await import("./audit");
  const { sdAuditLog } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  await assert.rejects(db.transaction(async (tx) => {
    await writeAudit({ actorUserId: null, action: "t2", entity: "t2", detail: { password: "p", ok: 1 } }, tx as any);
    const [row] = await tx.select().from(sdAuditLog).where(eq(sdAuditLog.entity, "t2"));
    assert.deepEqual(row.detail, { ok: 1 });
    throw new Rollback();
  }), Rollback);
});
