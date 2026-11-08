import { db } from "../db";
import { sdAuditLog } from "@shared/schema";

const SENSITIVE = /^(password|secret|token)$/i;

export function sanitizeDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeDetail);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE.test(k)) continue;
      out[k] = sanitizeDetail(v);
    }
    return out;
  }
  return value;
}

type Db = Pick<typeof db, "insert">;

export async function writeAudit(
  entry: { actorUserId: number | null; action: string; entity: string; entityId?: string; detail?: object },
  tx: Db = db,
): Promise<void> {
  await tx.insert(sdAuditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    detail: sanitizeDetail(entry.detail ?? {}) as object,
  });
}
