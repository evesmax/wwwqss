// API for coding agents (MCP). Auth: Bearer <keyId>.<secret> (see agentAuth.ts). Scope: the key's product_ids.
import crypto from "crypto";
import { type Express, type RequestHandler, type Response } from "express";
import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdAgentKeys, sdAgentAudit, sdProducts, sdInstances, sdTickets, sdTicketEvents, sdTicketComments, sdTimeEntries, sdTicketAttachments, sdAccounts, clientes } from "@shared/schema";
import { agentAuth, hashSecret, setAuditReason, type AgentReq } from "./agentAuth";
import { AGENT_PERMISSIONS, CREATE_ORIGINS, CREATE_PER_HOUR, CREATE_PRODUCT_CODE, CREATE_ALLOWED_TYPES, checkCreate, checkTransition } from "./agentPermissions";
import { wrap, requireRole, type Req } from "./httpUtil";
import { createTicket, TicketError, addComment, addTimeEntry, updateTicket, updateTimeEntry, deleteTimeEntry, transitionTicket, type Who } from "./ticketService";
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
  const who = (req: unknown): Who => ({ type: "agent", id: agent(req).key.id, name: agent(req).key.name });
  const perms = (req: unknown) => agent(req).permissions;
  const act = (res: Response, a: string) => { res.locals.auditAction = a; };
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
      agentMinutes: time.filter((e) => e.agentKeyId != null).reduce((a, e) => a + e.minutes, 0),
      humanMinutes: time.filter((e) => e.agentKeyId == null).reduce((a, e) => a + e.minutes, 0),
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

  app.get(`${A}/me`, agentAuth, wrap(async (req, res) => {
    const k = agent(req).key;
    res.json({ name: k.name, allProducts: k.allProducts, permissions: perms(req) });
  }));

  app.post(`${A}/tickets`, agentAuth, wrap(async (req, res) => {
    act(res, "create_ticket");
    const b = z.object({
      product: z.string().trim().min(1).max(50), origin: z.enum(CREATE_ORIGINS), type: z.enum(CREATE_ALLOWED_TYPES).default("internal_task"),
      title: z.string().trim().min(5).max(200), description: z.string().trim().max(20000).default(""),
      parentId: z.number().int().positive().optional(), severity: z.enum(["P1", "P2", "P3"]).nullish(),
    }).strict().parse(req.body);
    const deny = (status: number, message: string) => { setAuditReason(res, message); return void res.status(status).json({ message }); };
    const bad = checkCreate({ perms: perms(req), productCode: b.product.toUpperCase(), origin: b.origin, type: b.type });
    if (bad) return deny(403, bad);
    const keyRow = agent(req).key;
    const since = new Date(Date.now() - 3_600_000);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(sdAgentAudit)
      .where(and(eq(sdAgentAudit.keyId, keyRow.id), eq(sdAgentAudit.action, "create_ticket"), eq(sdAgentAudit.outcome, "ok"), gte(sdAgentAudit.at, since)));
    if (n >= CREATE_PER_HOUR) return deny(429, `Límite de ${CREATE_PER_HOUR} tickets creados por hora alcanzado`);
    const [p] = await db.select().from(sdProducts).where(and(eq(sdProducts.code, CREATE_PRODUCT_CODE), eq(sdProducts.active, true)));
    if (!p || !agent(req).productIds.includes(p.id)) return deny(403, "Producto no disponible para esta llave");
    const [inst] = await db.select({ id: sdInstances.id, accountId: sdInstances.accountId }).from(sdInstances)
      .innerJoin(sdAccounts, eq(sdAccounts.id, sdInstances.accountId))
      .where(and(eq(sdInstances.productId, p.id), eq(sdAccounts.internal, true), eq(sdAccounts.active, true), eq(sdInstances.active, true))).limit(1);
    if (!inst) return deny(409, "No hay cuenta interna configurada para este producto");
    if (b.parentId != null) {
      const [par] = await db.select().from(sdTickets).where(eq(sdTickets.id, b.parentId));
      if (!par || par.productId !== p.id) return deny(404, "Ticket padre no encontrado");
      if (par.parentId != null) return deny(400, "El ticket padre ya es hijo de otro: solo se permite un nivel (épica → hijos)");
    }
    try {
      const t = await createTicket({
        accountId: inst.accountId, instanceId: inst.id, productId: p.id, type: b.type, title: b.title, description: b.description,
        channel: "api", severity: b.severity ?? null, origin: b.origin, parentId: b.parentId ?? null,
      }, who(req), { notify: false });
      res.status(201).json({ id: t.id, key: t.key, status: t.status, origin: t.origin, parentId: t.parentId });
    } catch (e) { if (e instanceof TicketError) return deny(e.status, e.message); throw e; }
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

  app.patch(`${A}/tickets/:ref/time/:entryId`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = z.object({ minutes: z.number().int().optional(), workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().max(500).optional() }).parse(req.body);
    res.json(await updateTimeEntry(t.id, Number(req.params.entryId), { agentKeyId: agent(req).key.id, name: agent(req).key.name }, b));
  }));
  app.delete(`${A}/tickets/:ref/time/:entryId`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    await deleteTimeEntry(t.id, Number(req.params.entryId), { agentKeyId: agent(req).key.id, name: agent(req).key.name });
    res.status(204).end();
  }));

  app.patch(`${A}/tickets/:ref`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = z.object({
      severity: z.enum(["P0", "P1", "P2", "P3"]).nullable().optional(),
      p0: z.object({ inaccessible: z.boolean(), criticalBlocked: z.boolean(), hasWorkaround: z.boolean(), users: z.number().int().min(0) }).partial().nullish(),
      moduleArea: z.string().trim().max(100).optional(),
      environment: z.string().trim().max(100).optional(),
    }).parse(req.body);
    res.json(await updateTicket(t.id, { agentName: agent(req).key.name }, b));
  }));

  app.post(`${A}/tickets/:ref/effort`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = effortSchema.parse(req.body);
    res.status(201).json(await addComment(t.id, who(req), formatEffortNote(b, agent(req).key.name), "internal"));
  }));

  app.post(`${A}/tickets/:ref/transition`, agentAuth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res, String(req.params.ref)); if (!t) return;
    const b = z.object({ to: z.string(), reason: z.string().trim().max(1000).optional(), rca: rcaSchema.nullish() }).parse(req.body);
    act(res, `transition:${b.to}`);
    const denied = checkTransition(perms(req), b.to);
    if (denied) { setAuditReason(res, `${t.key}: ${t.status} → ${b.to} rechazado por permisos`); return void res.status(403).json({ message: denied }); }
    res.json((await transitionTicket(t.id, b.to, who(req), { reason: b.reason, rca: b.rca ?? null })).ticket);
  }));

  // --- admin: agent keys (owner only) ---
  const owner = requireRole("owner");
  const keySchema = z.object({ name: z.string().trim().min(2).max(100), productIds: z.array(z.number().int().positive()).max(50), allProducts: z.boolean().default(false), permissions: z.array(z.enum(AGENT_PERMISSIONS)).max(10).default(["transition_terminal", "release"]) });
  const view = (k: typeof sdAgentKeys.$inferSelect) => ({ id: k.id, keyId: k.keyId, name: k.name, productIds: k.productIds, allProducts: k.allProducts, permissions: k.permissions, active: k.active, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt });
  const mint = () => { const secret = crypto.randomBytes(32).toString("hex"); return { secret, secretHash: hashSecret(secret) }; };

  app.get("/api/desk/agent-keys", ...auth, owner, wrap(async (_req, res) => { res.json((await db.select().from(sdAgentKeys).orderBy(sdAgentKeys.id)).map(view)); }));
  app.post("/api/desk/agent-keys", ...auth, owner, wrap(async (req, res) => {
    const b = keySchema.parse(req.body), { secret, secretHash } = mint();
    const keyId = `qa_${crypto.randomBytes(8).toString("hex")}`;
    const [k] = await db.insert(sdAgentKeys).values({ keyId, name: b.name, secretHash, productIds: b.productIds, allProducts: b.allProducts, permissions: b.permissions }).returning();
    await writeAudit({ actorUserId: (req as Req).actor.userId, action: "agent.key.create", entity: "agent_key", entityId: String(k.id), detail: { name: b.name, productIds: b.productIds, allProducts: b.allProducts, permissions: b.permissions } });
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
