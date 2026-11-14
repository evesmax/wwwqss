import crypto from "crypto";
import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdSdkKeys, sdInstances, sdContacts, sdTickets, sdTicketAttachments, sdTicketEvents, sdTicketComments } from "@shared/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { RateLimiter, originAllowed, sanitizeContext, verifyJwt, type SdkClaims } from "./sdkAuth";
import { addComment, createTicket, transitionTicket, TicketError } from "./ticketService";
import { validateAttachment } from "./attachments";
import { requireRole, wrap, type Req } from "./httpUtil";
import { writeAudit } from "./audit";
import { draftFromTranscript, MAX_TRANSCRIPT } from "./ticketDraft";

type KeyRow = typeof sdSdkKeys.$inferSelect;
type SReq = Request & { sdk: { key: KeyRow; claims: SdkClaims; instanceId: number; accountId: number; contactId: number } };
const keyLimiter = new RateLimiter(120, 60_000);
const userLimiter = new RateLimiter(10, 3_600_000);
const commentLimiter = new RateLimiter(40, 3_600_000);
const draftLimiter = new RateLimiter(30, 3_600_000);
const SDK_TYPES = ["incident", "service_request", "question", "feature_request"] as const;

const createSchema = z.object({
  type: z.enum(SDK_TYPES).default("incident"), title: z.string().trim().min(3).max(200), description: z.string().max(20000).default(""),
  perceivedSeverity: z.enum(["P0", "P1", "P2", "P3"]).nullish(), context: z.unknown().optional(), moduleArea: z.string().trim().max(100).default(""),
});

async function activeOrigins(): Promise<string[]> {
  const rows = await db.select({ o: sdSdkKeys.allowedOrigins }).from(sdSdkKeys).where(eq(sdSdkKeys.active, true));
  return rows.flatMap((r) => (r.o as string[]) ?? []);
}
const peekKid = (t: string) => { try { return JSON.parse(Buffer.from(t.split(".")[0], "base64url").toString()).kid as string; } catch { return ""; } };

export function registerSdkRoutes(app: Express, auth: RequestHandler[]) {
  // --- CORS: preflight has no token, so accept any origin registered on an active key; each request re-checks its own key. ---
  app.use("/api/v1/sdk", async (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && originAllowed(origin, await activeOrigins().catch(() => []))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  });

  const sdkAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const h = String(req.headers.authorization ?? "");
      const token = h.startsWith("Bearer ") ? h.slice(7) : "";
      const [key] = token ? await db.select().from(sdSdkKeys).where(and(eq(sdSdkKeys.keyId, peekKid(token)), eq(sdSdkKeys.active, true))) : [];
      const v = verifyJwt(token, (kid) => (key && key.keyId === kid ? decryptSecret(key.secretEnc) : null));
      if (!key || !v.ok) return void res.status(401).json({ message: "No autorizado" });
      const origin = req.headers.origin;
      if (origin && !originAllowed(origin, (key.allowedOrigins as string[]) ?? [])) return void res.status(403).json({ message: "Origen no permitido" });
      if (!keyLimiter.hit(`k${key.id}`)) return void res.status(429).json({ message: "Demasiadas solicitudes" });
      // The tenant claim selects the customer's instance of this product; with a single active instance it may be omitted.
      const insts = await db.select().from(sdInstances).where(and(eq(sdInstances.productId, key.productId), eq(sdInstances.active, true)));
      const wanted = v.claims.tenant?.trim().toLowerCase();
      const matches = wanted ? insts.filter((i) => i.name.toLowerCase() === wanted) : insts.length === 1 ? insts : [];
      if (matches.length !== 1) return void res.status(400).json({ message: wanted ? "tenant no reconocido" : "tenant requerido" });
      const inst = matches[0];
      let [c] = await db.select().from(sdContacts).where(and(eq(sdContacts.accountId, inst.accountId), eq(sdContacts.email, v.claims.email)));
      if (!c) [c] = await db.insert(sdContacts).values({ accountId: inst.accountId, email: v.claims.email, name: v.claims.name ?? "", role: "contact" }).onConflictDoNothing().returning();
      if (!c) [c] = await db.select().from(sdContacts).where(and(eq(sdContacts.accountId, inst.accountId), eq(sdContacts.email, v.claims.email)));
      (req as SReq).sdk = { key, claims: v.claims, instanceId: inst.id, accountId: inst.accountId, contactId: c.id };
      db.update(sdSdkKeys).set({ lastUsedAt: new Date() }).where(eq(sdSdkKeys.id, key.id)).catch(() => {});
      next();
    } catch (e: any) { console.error("sdk auth error:", e.message); res.status(500).json({ message: "Error" }); }
  };
  const handle = (fn: (req: SReq, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req as SReq, res).catch((e) => {
      if (e instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos" });
      if (e instanceof TicketError) return res.status(e.status).json({ message: e.message });
      console.error("sdk route error:", e); next(e);
    });

  app.post("/api/v1/sdk/tickets", sdkAuth, handle(async (req, res) => {
    const b = createSchema.parse(req.body);
    const s = req.sdk;
    if (!userLimiter.hit(`u${s.key.id}:${s.claims.sub}`)) return void res.status(429).json({ message: "Límite de reportes por hora alcanzado" });
    const ctx = sanitizeContext(b.context);
    const t = await createTicket({
      accountId: s.accountId, type: b.type, title: b.title, description: b.description, instanceId: s.instanceId, requesterContactId: s.contactId,
      channel: "widget", moduleArea: b.moduleArea, perceivedSeverity: b.type === "incident" ? b.perceivedSeverity ?? null : null,
    }, { type: "contact", id: s.contactId });
    await db.update(sdTickets).set({ context: { ...ctx, sdkUser: s.claims.sub } }).where(eq(sdTickets.id, t.id));
    res.status(201).json({ id: t.id, key: t.key });
  }));

  app.post("/api/v1/sdk/tickets/draft", sdkAuth, handle(async (req, res) => {
    const b = z.object({ transcript: z.string().trim().min(5).max(MAX_TRANSCRIPT * 2), type: z.enum(SDK_TYPES).default("incident") }).parse(req.body);
    if (!draftLimiter.hit(`d${req.sdk.key.id}:${req.sdk.claims.sub}`)) return void res.status(429).json({ message: "Límite de dictados por hora alcanzado" });
    res.json(await draftFromTranscript(b.transcript, b.type));
  }));

  app.post("/api/v1/sdk/tickets/:id/attachments", sdkAuth, express.raw({ type: () => true, limit: "3mb" }), handle(async (req, res) => {
    const s = req.sdk, id = Number(req.params.id);
    const [t] = Number.isInteger(id) ? await db.select().from(sdTickets).where(eq(sdTickets.id, id)) : [];
    if (!t || t.requesterContactId !== s.contactId || t.channel !== "widget") return void res.status(404).json({ message: "No encontrado" });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const v = validateAttachment(String(req.query.filename ?? "captura.png"), String(req.headers["content-type"] ?? ""), body.length);
    if (!v.ok || !v.mime.startsWith("image/")) return void res.status(400).json({ message: v.ok ? "Solo imágenes" : v.error });
    const [a] = await db.insert(sdTicketAttachments).values({ ticketId: t.id, visibility: "public", filename: v.filename, mime: v.mime, size: body.length, data: body, uploaderType: "contact", uploaderId: s.contactId }).returning({ id: sdTicketAttachments.id });
    await db.insert(sdTicketEvents).values({ ticketId: t.id, actorType: "contact", actorId: s.contactId, kind: "attachment", detail: { attachmentId: a.id, filename: v.filename, visibility: "public" } });
    res.status(201).json(a);
  }));

  app.get("/api/v1/sdk/tickets", sdkAuth, handle(async (req, res) => {
    const rows = await db.select({ id: sdTickets.id, key: sdTickets.key, title: sdTickets.title, status: sdTickets.status, createdAt: sdTickets.createdAt, updatedAt: sdTickets.updatedAt })
      .from(sdTickets).where(eq(sdTickets.requesterContactId, req.sdk.contactId)).orderBy(desc(sdTickets.updatedAt)).limit(50);
    res.json(rows);
  }));

  // The requester adds a public note to one of their own tickets while it is still open. A reply to "waiting for you"
  // moves the ticket back to in progress (addComment does that); finished tickets are not reopened from the widget.
  app.post("/api/v1/sdk/tickets/:id/comments", sdkAuth, handle(async (req, res) => {
    const id = Number(req.params.id);
    const b = z.object({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
    const [t] = Number.isInteger(id) ? await db.select({ id: sdTickets.id, status: sdTickets.status, requesterContactId: sdTickets.requesterContactId }).from(sdTickets).where(eq(sdTickets.id, id)) : [];
    if (!t || t.requesterContactId !== req.sdk.contactId) return void res.status(404).json({ message: "No encontrado" });
    if (["resolved", "closed", "released", "duplicate", "cancelled", "rejected"].includes(t.status)) return void res.status(409).json({ message: "El reporte ya está terminado; abre uno nuevo si el problema continúa." });
    if (!commentLimiter.hit(`c${req.sdk.key.id}:${req.sdk.claims.sub}`)) return void res.status(429).json({ message: "Límite de comentarios por hora alcanzado" });
    const c = await addComment(t.id, { type: "contact", id: req.sdk.contactId }, b.body, "public");
    res.status(201).json({ id: c.id, createdAt: c.createdAt });
  }));

  // The requester validates the delivery: a ticket support marked "resolved" is closed by them.
  app.post("/api/v1/sdk/tickets/:id/confirm", sdkAuth, handle(async (req, res) => {
    const id = Number(req.params.id);
    const [t] = Number.isInteger(id) ? await db.select({ id: sdTickets.id, status: sdTickets.status, requesterContactId: sdTickets.requesterContactId }).from(sdTickets).where(eq(sdTickets.id, id)) : [];
    if (!t || t.requesterContactId !== req.sdk.contactId) return void res.status(404).json({ message: "No encontrado" });
    if (t.status !== "resolved") return void res.status(409).json({ message: "El reporte no está pendiente de tu validación" });
    await transitionTicket(t.id, "closed", { type: "contact", id: req.sdk.contactId }, { reason: "Confirmado por el cliente" });
    res.json({ ok: true });
  }));

  // Progress of one of the caller's own tickets: status history and public notes only (same rules as the customer portal:
  // no internal notes, no reasons, no names of staff).
  app.get("/api/v1/sdk/tickets/:id", sdkAuth, handle(async (req, res) => {
    const id = Number(req.params.id);
    const [t] = Number.isInteger(id) ? await db.select({ id: sdTickets.id, key: sdTickets.key, title: sdTickets.title, status: sdTickets.status, type: sdTickets.type, requesterContactId: sdTickets.requesterContactId, createdAt: sdTickets.createdAt, updatedAt: sdTickets.updatedAt })
      .from(sdTickets).where(eq(sdTickets.id, id)) : [];
    if (!t || t.requesterContactId !== req.sdk.contactId) return void res.status(404).json({ message: "No encontrado" });
    const [comments, events] = await Promise.all([
      db.select({ id: sdTicketComments.id, authorType: sdTicketComments.authorType, body: sdTicketComments.body, createdAt: sdTicketComments.createdAt })
        .from(sdTicketComments).where(and(eq(sdTicketComments.ticketId, t.id), eq(sdTicketComments.visibility, "public"))).orderBy(sdTicketComments.id),
      db.select({ at: sdTicketEvents.at, detail: sdTicketEvents.detail }).from(sdTicketEvents)
        .where(and(eq(sdTicketEvents.ticketId, t.id), eq(sdTicketEvents.kind, "status_changed"))).orderBy(sdTicketEvents.id),
    ]);
    const { requesterContactId: _r, ...ticket } = t;
    res.json({ ticket, comments, history: events.map((e) => ({ at: e.at, from: (e.detail as any).from, to: (e.detail as any).to })) });
  }));

  // --- admin: key management (global managers) ---
  const mgr = requireRole("owner", "support_manager");
  const global: RequestHandler = (req, res, next) => ((req as Req).actor.scope.global ? next() : void res.status(403).json({ message: "Sin permiso" }));
  const keySchema = z.object({ productId: z.number().int().positive(), name: z.string().trim().min(2).max(100),
    allowedOrigins: z.array(z.string().url().refine((u) => new URL(u).origin === u, "Usa solo el origen, sin ruta")).max(20).default([]) });
  const view = (k: KeyRow) => ({ id: k.id, keyId: k.keyId, productId: k.productId, name: k.name, allowedOrigins: k.allowedOrigins, active: k.active, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt });

  app.get("/api/desk/sdk/keys", ...auth, mgr, global, wrap(async (_req, res) => { res.json((await db.select().from(sdSdkKeys).orderBy(sdSdkKeys.id)).map(view)); }));
  app.post("/api/desk/sdk/keys", ...auth, mgr, global, wrap(async (req, res) => {
    const b = keySchema.parse(req.body);
    const keyId = `qk_${crypto.randomBytes(8).toString("hex")}`, secret = crypto.randomBytes(32).toString("hex");
    const [k] = await db.insert(sdSdkKeys).values({ keyId, productId: b.productId, name: b.name, secretEnc: encryptSecret(secret), allowedOrigins: b.allowedOrigins }).returning();
    await writeAudit({ actorUserId: req.actor.userId, action: "sdk.key.create", entity: "sdk_key", entityId: String(k.id), detail: { name: b.name, productId: b.productId } });
    res.status(201).json({ ...view(k), secret }); // the secret is shown once
  }));
  app.put("/api/desk/sdk/keys/:id", ...auth, mgr, global, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = z.object({ name: z.string().trim().min(2).max(100), allowedOrigins: keySchema.shape.allowedOrigins, active: z.boolean() }).parse(req.body);
    const [k] = Number.isInteger(id) ? await db.update(sdSdkKeys).set(b).where(eq(sdSdkKeys.id, id)).returning() : [];
    if (!k) return void res.status(404).json({ message: "No encontrado" });
    await writeAudit({ actorUserId: req.actor.userId, action: "sdk.key.update", entity: "sdk_key", entityId: String(id), detail: b });
    res.json(view(k));
  }));
  app.post("/api/desk/sdk/keys/:id/rotate", ...auth, mgr, global, wrap(async (req, res) => {
    const id = Number(req.params.id), secret = crypto.randomBytes(32).toString("hex");
    const [k] = Number.isInteger(id) ? await db.update(sdSdkKeys).set({ secretEnc: encryptSecret(secret) }).where(eq(sdSdkKeys.id, id)).returning() : [];
    if (!k) return void res.status(404).json({ message: "No encontrado" });
    await writeAudit({ actorUserId: req.actor.userId, action: "sdk.key.rotate", entity: "sdk_key", entityId: String(id) });
    res.json({ ...view(k), secret });
  }));
}
