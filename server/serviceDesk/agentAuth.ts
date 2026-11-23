// Auth for the coding-agent API: Bearer <keyId>.<secret>. Only the SHA-256 of the secret is stored.
import crypto from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sdAgentKeys, sdProducts, sdAgentAudit } from "@shared/schema";
import { normalizePermissions, visibleProductIds, type AgentPermission } from "./agentPermissions";
import { RateLimiter } from "./sdkAuth";

export type AgentKeyRow = typeof sdAgentKeys.$inferSelect;
export type AgentReq = Request & { agent: { key: AgentKeyRow; productIds: number[]; permissions: AgentPermission[] } };

export const hashSecret = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function parseAgentToken(header: string | undefined): { keyId: string; secret: string } | null {
  const m = /^Bearer\s+(qa_[a-f0-9]{16})\.([a-f0-9]{64})$/.exec(String(header ?? "").trim());
  return m ? { keyId: m[1], secret: m[2] } : null;
}

const limiter = new RateLimiter(120, 60_000);

/** Records one audit row for a request made with a known key. Never throws and never blocks the response. */
export function auditAgentRequest(row: { keyId: number; method: string; route: string; action?: string; ticketRef?: string | null; status: number; reason?: string | null }) {
  const outcome = row.status < 400 ? "ok" : row.status >= 500 ? "error" : row.status === 401 || row.status === 403 || row.status === 404 || row.status === 429 ? "denied" : "rejected";
  void db.insert(sdAgentAudit).values({ keyId: row.keyId, method: row.method, route: row.route, action: row.action ?? "", ticketRef: row.ticketRef ?? null, status: row.status, outcome, reason: row.reason ? row.reason.slice(0, 300) : null })
    .catch((e) => console.error("agent audit:", (e as Error).message));
}
/** Handlers call this to leave a human-readable reason for a denial/rejection in the audit row. */
export const setAuditReason = (res: Response, reason: string) => { res.locals.auditReason = reason; };

export const agentAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tok = parseAgentToken(req.headers.authorization);
    const [k] = tok ? await db.select().from(sdAgentKeys).where(eq(sdAgentKeys.keyId, tok.keyId)) : [];
    const a = Buffer.from(hashSecret(tok?.secret ?? "")), b = Buffer.from(k?.secretHash ?? "0".repeat(64));
    const good = !!tok && !!k && a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!good || !k.active) {
      if (k) auditAgentRequest({ keyId: k.id, method: req.method, route: req.path.replace(/\/\d+/g, "/:n"), action: "auth", status: 401, reason: good ? "llave revocada" : "secreto inválido" });
      return void res.status(401).json({ message: "No autorizado" });
    }
    if (!limiter.hit(k.keyId)) { auditAgentRequest({ keyId: k.id, method: req.method, route: req.path.replace(/\/\d+/g, "/:n"), action: "rate_limit", status: 429, reason: "demasiadas solicitudes" }); return void res.status(429).json({ message: "Demasiadas solicitudes" }); }
    const all = k.allProducts ? (await db.select({ id: sdProducts.id }).from(sdProducts).where(eq(sdProducts.active, true))).map((p) => p.id) : [];
    (req as AgentReq).agent = { key: k, productIds: visibleProductIds(k, all), permissions: normalizePermissions(k.permissions) };
    void db.update(sdAgentKeys).set({ lastUsedAt: new Date() }).where(eq(sdAgentKeys.id, k.id)).catch(() => {});
    res.on("finish", () => auditAgentRequest({
      keyId: k.id, method: req.method, route: `${req.baseUrl}${req.route?.path ?? req.path}`, ticketRef: req.params?.ref ?? null,
      action: String(res.locals.auditAction ?? ""), status: res.statusCode, reason: res.locals.auditReason ?? null,
    }));
    next();
  } catch (e) { console.error("agent auth:", (e as Error).message); res.status(500).json({ message: "Error" }); }
};
