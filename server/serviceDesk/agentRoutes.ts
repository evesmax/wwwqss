// API for coding agents (MCP). Auth: Bearer <keyId>.<secret> (see agentAuth.ts). Scope: the key's product_ids.
import crypto from "crypto";
import { type Express, type RequestHandler, type Response } from "express";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdAgentKeys, sdProducts, sdTickets, sdTicketEvents, sdTicketComments, sdTimeEntries, sdTicketAttachments, sdAccounts, clientes } from "@shared/schema";
import { agentAuth, hashSecret, type AgentReq } from "./agentAuth";
import { wrap, requireRole, type Req } from "./httpUtil";
import { addComment, addTimeEntry, transitionTicket, type Who } from "./ticketService";
import { nextStatuses, statusesFor } from "./ticketRules";
import { writeAudit } from "./audit";

const CLOSED = ["resolved", "closed", "duplicate", "cancelled", "rejected", "released", "deferred"];
const rcaSchema = z.object({
  cause: z.string().trim().min(1), fix: z.string().trim().min(1), prevention: z.string().trim().min(1),
  kind: z.enum(["code", "infrastructure", "third_party", "configuration", "usage"]),
});
const n = z.number().int().min(0).max(1e10);
const effortSchema = z.object({
  inputTokens: n, outputTokens: n, cacheReadTokens: n.default(0), cacheWriteTokens: n.default(0),
  model: z.string().trim().max(100).default(""), costUsd: z.number().min(0).max(1e6).nullable().default(null),
  durationMin: z.number().min(0).max(1e5).nullable().default(null), note: z.string().trim().max(500).default(""),
});

export function formatEffortNote(e: z.infer<typeof effortSchema>, agent: string): string {
  const total = e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheWriteTokens;
  return [
    "[ESFUERZO-IA]",
    `agente: ${agent}${e.model ? ` · modelo: ${e.model}` : ""}`,
    `tokens: entrada ${e.inputTokens} · salida ${e.outputTokens} · caché lectura ${e.cacheReadTokens} · caché escritura ${e.cacheWriteTokens} · total ${total}`,
    e.costUsd != null ? `costo estimado (USD): ${e.costUsd.toFixed(4)}` : "",
    e.durationMin != null ? `duración (min): ${e.durationMin.toFixed(1)}` : "",
    e.note,
  ].filter(Boolean).join("\n");
}

export function registerAgentRoutes(app: Express, auth: RequestHandler[]) {
  const A = "/api/v1/agent";
  const agent = (req: unknown) => (req as AgentReq).agent;
  const who = (req: unknown): Who => ({ type: "agent", id: null, name: agent(req).key.name });
  const scoped = (req: unknown) => agent(req).productIds;

  async function ticketOr404(req: unknown, res: Response, ref: string) {
    const ids = scoped(req);
    const byId = /^\d+$/.test(ref);
    const [t] = ids.length ? await db.select().from(sdTickets).where(byId ? eq(sdTickets.id, Number(ref)) : eq(sdTickets.key, ref.toUpperCase())) : [];
    if (!t || t.productId == null || !ids.includes(t.productId)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return t;
  }

  app.get(`${A}/products`, agentAuth, wrap(async (req, res) => {
    const ids = scoped(req);
    res.json(ids.length ? await db.select({ id: sdProducts.id, code: sdProducts.code, name: sdProducts.name }).from(sdProducts).where(inArray(sdProducts.id, ids)) : []);
  }));

  app.get(`${A}/tickets`, agentAuth, wrap(async (req, res) => {
    const ids = scoped(req);
    const q = z.object({ product: z.string().max(50).optional(), status: z.string().max(40).optional(), open: z.enum(["1", "0"]).optional() }).parse(req.query);
    if (!ids.length) return res.json([]);
    const conds = [inArray(sdTickets.productId, ids)];
    if (q.product) {
      const [p] = await db.select({ id: sdProducts.id }).from(sdProducts).where(eq(sdProducts.code, q.product));
      if (!p || !ids.includes(p.id)) return res.json([]);
      conds.push(eq(sdTickets.productId, p.id));
    }
    if (q.status) conds.push(eq(sdTickets.status, q.status));
    if (q.open === "1" || (!q.status && q.open !== "0")) conds.push(notInArray(sdTickets.status, CLOSED));
    const rows = await db.select({
      id: sdTickets.id, key: sdTickets.key, title: sdTickets.title, type: sdTickets.type, status: sdTickets.status, severity: sdTickets.severity,
      productCode: sdProducts.code, createdAt: sdTickets.createdAt, updatedAt: sdTickets.updatedAt,
    }).from(sdTickets).leftJoin(sdProducts, eq(sdProducts.id, sdTickets.productId)).where(and(...conds)).orderBy(desc(sdTickets.updatedAt)).limit(100);
    res.json(rows);
  }));

  app.get(`${A}/tickets/:ref`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const [events, comments, time, attachments, [product], [acc]] = await Promise.all([
      db.select().from(sdTicketEvents).where(eq(sdTicketEvents.ticketId, t.id)).orderBy(sdTicketEvents.id),
      db.select().from(sdTicketComments).where(eq(sdTicketComments.ticketId, t.id)).orderBy(sdTicketComments.id),
      db.select().from(sdTimeEntries).where(eq(sdTimeEntries.ticketId, t.id)).orderBy(sdTimeEntries.id),
      db.select({ id: sdTicketAttachments.id, filename: sdTicketAttachments.filename, mime: sdTicketAttachments.mime, size: sdTicketAttachments.size, visibility: sdTicketAttachments.visibility })
        .from(sdTicketAttachments).where(eq(sdTicketAttachments.ticketId, t.id)).orderBy(sdTicketAttachments.id),
      db.select({ code: sdProducts.code, name: sdProducts.name }).from(sdProducts).where(eq(sdProducts.id, t.productId!)),
      db.select({ cliente: clientes.nombreNegocio }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(eq(sdAccounts.id, t.accountId)),
    ]);
    const { requesterContactId: _r, ...ticket } = t;
    res.json({
      ticket, product, account: acc?.cliente ?? null, events, comments, time, attachments,
      nextStatuses: nextStatuses(t.type, t.status), allStatuses: statusesFor(t.type),
      totalMinutes: time.reduce((a, e) => a + e.minutes, 0),
    });
  }));

  app.get(`${A}/attachments/:id`, agentAuth, wrap(async (req, res) => {
    const [a] = await db.select().from(sdTicketAttachments).where(eq(sdTicketAttachments.id, Number(req.params.id)));
    const [t] = a ? await db.select().from(sdTickets).where(eq(sdTickets.id, a.ticketId)) : [];
    if (!a || !t || t.productId == null || !scoped(req).includes(t.productId)) return void res.status(404).json({ message: "No encontrado" });
    res.setHeader("Content-Type", a.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(a.filename)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(a.data);
  }));

  app.post(`${A}/tickets/:ref/comments`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = z.object({ body: z.string().trim().min(1).max(20000), visibility: z.enum(["public", "internal"]).default("internal") }).parse(req.body);
    res.status(201).json(await addComment(t.id, who(req), b.body, b.visibility));
  }));

  app.post(`${A}/tickets/:ref/time`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = z.object({ minutes: z.number().int(), workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(500).default("") }).parse(req.body);
    // Internal record only: never billable, never touches the hours bank.
    res.status(201).json(await addTimeEntry(t.id, { agentKeyId: agent(req).key.id, name: agent(req).key.name }, { ...b, billable: false }));
  }));

  app.post(`${A}/tickets/:ref/effort`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = effortSchema.parse(req.body);
    res.status(201).json(await addComment(t.id, who(req), formatEffortNote(b, agent(req).key.name), "internal"));
  }));

  app.post(`${A}/tickets/:ref/transition`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = z.object({ to: z.string(), reason: z.string().trim().max(1000).optional(), rca: rcaSchema.nullish() }).parse(req.body);
    res.json((await transitionTicket(t.id, b.to, who(req), { reason: b.reason, rca: b.rca ?? null })).ticket);
  }));

  // --- admin: agent keys (owner only) ---
  const owner = requireRole("owner");
  const keySchema = z.object({ name: z.string().trim().min(2).max(100), productIds: z.array(z.number().int().positive()).max(50) });
  const view = (k: typeof sdAgentKeys.$inferSelect) => ({ id: k.id, keyId: k.keyId, name: k.name, productIds: k.productIds, active: k.active, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt });
  const mint = () => { const secret = crypto.randomBytes(32).toString("hex"); return { secret, secretHash: hashSecret(secret) }; };

  app.get("/api/desk/agent-keys", ...auth, owner, wrap(async (_req, res) => { res.json((await db.select().from(sdAgentKeys).orderBy(sdAgentKeys.id)).map(view)); }));
  app.post("/api/desk/agent-keys", ...auth, owner, wrap(async (req, res) => {
    const b = keySchema.parse(req.body), { secret, secretHash } = mint();
    const keyId = `qa_${crypto.randomBytes(8).toString("hex")}`;
    const [k] = await db.insert(sdAgentKeys).values({ keyId, name: b.name, secretHash, productIds: b.productIds }).returning();
    await writeAudit({ actorUserId: (req as Req).actor.userId, action: "agent.key.create", entity: "agent_key", entityId: String(k.id), detail: { name: b.name, productIds: b.productIds } });
    res.status(201).json({ ...view(k), secret, token: `${keyId}.${secret}` }); // shown once
  }));
  app.put("/api/desk/agent-keys/:id", ...auth, owner, wrap(async (req, res) => {
    const id = Number(req.params.id), b = keySchema.extend({ active: z.boolean() }).parse(req.body);
    const [k] = Number.isInteger(id) ? await db.update(sdAgentKeys).set(b).where(eq(sdAgentKeys.id, id)).returning() : [];
    if (!k) return void res.status(404).json({ message: "No encontrado" });
    await writeAudit({ actorUserId: (req as Req).actor.userId, action: "agent.key.update", entity: "agent_key", entityId: String(id), detail: b });
    res.json(view(k));
  }));
  app.post("/api/desk/agent-keys/:id/rotate", ...auth, owner, wrap(async (req, res) => {
    const id = Number(req.params.id), { secret, secretHash } = mint();
    const [k] = Number.isInteger(id) ? await db.update(sdAgentKeys).set({ secretHash }).where(eq(sdAgentKeys.id, id)).returning() : [];
    if (!k) return void res.status(404).json({ message: "No encontrado" });
    await writeAudit({ actorUserId: (req as Req).actor.userId, action: "agent.key.rotate", entity: "agent_key", entityId: String(id) });
    res.json({ ...view(k), secret, token: `${k.keyId}.${secret}` });
  }));
}
