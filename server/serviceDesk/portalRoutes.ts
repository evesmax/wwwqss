import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { clientes, sdAccounts, sdContacts, sdTickets, sdTicketEvents, sdTicketComments, sdTicketAttachments, sdInstances, sdProducts } from "@shared/schema";
import { LoginThrottle } from "../loginThrottle";
import { accountProductMap } from "./access";
import { canContactSeeTicket, PORTAL_TYPES, type PortalContact } from "./portalRules";
import { consumeMagicToken, requestMagicLink, normEmail } from "./portalAuth";
import { addComment, createTicket, TicketError } from "./ticketService";
import { validateAttachment } from "./attachments";
import { nextStatuses } from "./ticketRules";

type PReq = Request & { contacts: PortalContact[]; email: string };
const requestThrottle = new LoginThrottle();
const verifyThrottle = new LoginThrottle();

const saveSession = (req: Request) => new Promise<void>((res, rej) => req.session.save((e) => (e ? rej(e) : res())));

export function registerPortalRoutes(app: Express) {
  const handle = (fn: (req: PReq, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req as PReq, res).catch((e) => {
      if (e instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos" });
      if (e instanceof TicketError) return res.status(e.status).json({ message: e.message });
      console.error("portal route error:", e);
      next(e);
    });

  const portalAuth = (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = req.session.portalEmail;
      if (!email) return res.status(401).json({ message: "No autorizado" });
      const rows = await db.select({ id: sdContacts.id, accountId: sdContacts.accountId, role: sdContacts.role })
        .from(sdContacts).innerJoin(sdAccounts, eq(sdAccounts.id, sdContacts.accountId))
        .where(and(sql`lower(${sdContacts.email}) = ${email}`, eq(sdAccounts.active, true)));
      if (!rows.length) return req.session.destroy(() => res.status(401).json({ message: "No autorizado" }));
      (req as PReq).contacts = rows; (req as PReq).email = email;
      next();
    } catch (e) { next(e); }
  });

  app.post("/api/portal/auth/request", handle(async (req, res) => {
    const { email } = z.object({ email: z.string().trim().email().max(200) }).parse(req.body);
    const key = String(req.ip);
    if (requestThrottle.isBlocked(key)) return res.status(429).json({ message: "Demasiados intentos" });
    requestThrottle.recordFailure(key); // counts every request; window 15 min, max 5
    if (!req.is("application/json")) return res.status(415).json({ message: "Tipo de contenido no soportado" });
    res.json({ ok: true });
    void requestMagicLink(email).catch((e) => console.error("magic link error:", e.message)); // after responding: no timing oracle
  }));

  app.post("/api/portal/auth/verify", handle(async (req, res) => {
    if (!req.is("application/json")) return res.status(415).json({ message: "Tipo de contenido no soportado" }); // blocks cross-site form login-CSRF
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.body);
    const key = String(req.ip);
    if (verifyThrottle.isBlocked(key)) return res.status(429).json({ message: "Demasiados intentos" });
    const email = await consumeMagicToken(token);
    if (!email) { verifyThrottle.recordFailure(key); return res.status(401).json({ message: "Enlace inválido o expirado" }); }
    // Rotate the session id; keep an existing admin login so both can coexist in one browser.
    const keepUser = req.session.userId;
    await new Promise<void>((ok, bad) => req.session.regenerate((e) => (e ? bad(e) : ok())));
    if (keepUser) req.session.userId = keepUser;
    req.session.portalEmail = normEmail(email);
    await saveSession(req);
    res.json({ ok: true });
  }));

  app.post("/api/portal/auth/logout", (req, res) => { delete req.session.portalEmail; req.session.save(() => res.json({ ok: true })); });

  app.get("/api/portal/me", portalAuth, handle(async (req, res) => {
    const ids = Array.from(new Set(req.contacts.map((c) => c.accountId)));
    const accs = await db.select({ id: sdAccounts.id, cliente: clientes.nombreNegocio }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(inArray(sdAccounts.id, ids));
    const pm = await accountProductMap();
    const prods = await db.select().from(sdProducts);
    const insts = await db.select().from(sdInstances).where(inArray(sdInstances.accountId, ids));
    res.json({
      email: req.email,
      accounts: accs.map((a) => ({
        ...a, role: req.contacts.find((c) => c.accountId === a.id)!.role,
        products: prods.filter((p) => (pm.get(a.id) ?? []).includes(p.id)).map((p) => ({ id: p.id, name: p.name })),
        instances: insts.filter((i) => i.accountId === a.id && i.active).map((i) => ({ id: i.id, name: i.name, productId: i.productId })),
      })),
    });
  }));

  const portalFields = {
    id: sdTickets.id,  key: sdTickets.key, title: sdTickets.title, type: sdTickets.type, status: sdTickets.status, severity: sdTickets.severity,
    perceivedSeverity: sdTickets.perceivedSeverity, accountId: sdTickets.accountId, requesterContactId: sdTickets.requesterContactId,
    sharedWithAccount: sdTickets.sharedWithAccount, createdAt: sdTickets.createdAt, updatedAt: sdTickets.updatedAt, description: sdTickets.description,
  };
  async function ticketFor(req: PReq, res: Response) {
    const id = Number(req.params.id);
    const [t] = Number.isInteger(id) ? await db.select(portalFields).from(sdTickets).where(eq(sdTickets.id, id)) : [];
    if (!t || !canContactSeeTicket(req.contacts, t)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return t;
  }
  const strip = ({ requesterContactId, sharedWithAccount, ...rest }: any) => rest;

  app.get("/api/portal/tickets", portalAuth, handle(async (req, res) => {
    const ids = Array.from(new Set(req.contacts.map((c) => c.accountId)));
    const rows = await db.select(portalFields).from(sdTickets).where(inArray(sdTickets.accountId, ids)).orderBy(desc(sdTickets.updatedAt)).limit(500);
    res.json(rows.filter((t) => canContactSeeTicket(req.contacts, t)).map(({ description, ...r }) => strip(r)));
  }));

  const createSchema = z.object({
    accountId: z.number().int().positive(), type: z.enum(PORTAL_TYPES), title: z.string().trim().min(3).max(200),
    description: z.string().max(20000).default(""), instanceId: z.number().int().positive().nullish(), productId: z.number().int().positive().nullish(),
    perceivedSeverity: z.enum(["P0", "P1", "P2", "P3"]).nullish(), environment: z.enum(["prod", "stg"]).default("prod"),
  });
  app.post("/api/portal/tickets", portalAuth, handle(async (req, res) => {
    const b = createSchema.parse(req.body);
    const me = req.contacts.find((c) => c.accountId === b.accountId);
    if (!me) return res.status(404).json({ message: "No encontrado" });
    // Customers only propose a severity; the real severity is set by support (triage).
    const t = await createTicket({ ...b, severity: null, requesterContactId: me.id, channel: "portal", perceivedSeverity: b.type === "incident" ? b.perceivedSeverity ?? null : null }, { type: "contact", id: me.id });
    res.status(201).json({ id: t.id, key: t.key });
  }));

  app.get("/api/portal/tickets/:id", portalAuth, handle(async (req, res) => {
    const t = await ticketFor(req, res); if (!t) return;
    const [comments, events, attachments] = await Promise.all([
      db.select({ id: sdTicketComments.id, authorType: sdTicketComments.authorType, body: sdTicketComments.body, createdAt: sdTicketComments.createdAt })
        .from(sdTicketComments).where(and(eq(sdTicketComments.ticketId, t.id), eq(sdTicketComments.visibility, "public"))).orderBy(sdTicketComments.id),
      db.select({ at: sdTicketEvents.at, detail: sdTicketEvents.detail }).from(sdTicketEvents).where(and(eq(sdTicketEvents.ticketId, t.id), eq(sdTicketEvents.kind, "status_changed"))).orderBy(sdTicketEvents.id),
      db.select({ id: sdTicketAttachments.id, filename: sdTicketAttachments.filename, size: sdTicketAttachments.size }).from(sdTicketAttachments)
        .where(and(eq(sdTicketAttachments.ticketId, t.id), eq(sdTicketAttachments.visibility, "public"))).orderBy(sdTicketAttachments.id),
    ]);
    res.json({
      ticket: strip(t), comments, attachments,
      history: events.map((e) => ({ at: e.at, from: (e.detail as any).from, to: (e.detail as any).to })), // reason omitted: may be internal
      canComment: !["closed", "duplicate", "cancelled", "rejected"].includes(t.status) && nextStatuses(t.type, t.status) !== undefined,
    });
  }));

  app.post("/api/portal/tickets/:id/comments", portalAuth, handle(async (req, res) => {
    const t = await ticketFor(req, res); if (!t) return;
    if (["closed", "duplicate", "cancelled", "rejected"].includes(t.status)) return res.status(409).json({ message: "El ticket está cerrado" });
    const { body } = z.object({ body: z.string().trim().min(1).max(20000) }).parse(req.body);
    const me = req.contacts.find((c) => c.accountId === t.accountId)!;
    const c = await addComment(t.id, { type: "contact", id: me.id }, body, "public");
    res.status(201).json({ id: c.id });
  }));

  app.post("/api/portal/tickets/:id/attachments", portalAuth, express.raw({ type: () => true, limit: "6mb" }), handle(async (req, res) => {
    const t = await ticketFor(req, res); if (!t) return;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const v = validateAttachment(String(req.query.filename ?? "archivo"), String(req.headers["content-type"] ?? ""), body.length);
    if (!v.ok) throw new TicketError(v.error);
    const me = req.contacts.find((c) => c.accountId === t.accountId)!;
    const [a] = await db.insert(sdTicketAttachments).values({ ticketId: t.id, visibility: "public", filename: v.filename, mime: v.mime, size: body.length, data: body, uploaderType: "contact", uploaderId: me.id }).returning({ id: sdTicketAttachments.id });
    await db.insert(sdTicketEvents).values({ ticketId: t.id, actorType: "contact", actorId: me.id, kind: "attachment", detail: { attachmentId: a.id, filename: v.filename, visibility: "public" } });
    res.status(201).json(a);
  }));

  app.get("/api/portal/attachments/:id", portalAuth, handle(async (req, res) => {
    const [a] = await db.select().from(sdTicketAttachments).where(and(eq(sdTicketAttachments.id, Number(req.params.id)), eq(sdTicketAttachments.visibility, "public")));
    const [t] = a ? await db.select(portalFields).from(sdTickets).where(eq(sdTickets.id, a.ticketId)) : [];
    if (!a || !t || !canContactSeeTicket(req.contacts, t)) return res.status(404).json({ message: "No encontrado" });
    res.setHeader("Content-Type", a.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(a.filename)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(a.data);
  }));
}
