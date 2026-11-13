// Auth for the coding-agent API: Bearer <keyId>.<secret>. Only the SHA-256 of the secret is stored.
import crypto from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sdAgentKeys } from "@shared/schema";
import { RateLimiter } from "./sdkAuth";

export type AgentKeyRow = typeof sdAgentKeys.$inferSelect;
export type AgentReq = Request & { agent: { key: AgentKeyRow; productIds: number[] } };

export const hashSecret = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function parseAgentToken(header: string | undefined): { keyId: string; secret: string } | null {
  const m = /^Bearer\s+(qa_[a-f0-9]{16})\.([a-f0-9]{64})$/.exec(String(header ?? "").trim());
  return m ? { keyId: m[1], secret: m[2] } : null;
}

const limiter = new RateLimiter(120, 60_000);

export const agentAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tok = parseAgentToken(req.headers.authorization);
    const [k] = tok ? await db.select().from(sdAgentKeys).where(eq(sdAgentKeys.keyId, tok.keyId)) : [];
    const a = Buffer.from(hashSecret(tok?.secret ?? "")), b = Buffer.from(k?.secretHash ?? "0".repeat(64));
    if (!tok || !k || !k.active || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return void res.status(401).json({ message: "No autorizado" });
    if (!limiter.hit(k.keyId)) return void res.status(429).json({ message: "Demasiadas solicitudes" });
    (req as AgentReq).agent = { key: k, productIds: ((k.productIds as unknown[]) ?? []).filter((x): x is number => Number.isInteger(x)) };
    void db.update(sdAgentKeys).set({ lastUsedAt: new Date() }).where(eq(sdAgentKeys.id, k.id)).catch(() => {});
    next();
  } catch (e) { console.error("agent auth:", (e as Error).message); res.status(500).json({ message: "Error" }); }
};
