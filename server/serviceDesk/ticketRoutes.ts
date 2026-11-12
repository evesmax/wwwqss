import express, { type Express, type RequestHandler, type Response } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  users, clientes, sdAccounts, sdTickets, sdTicketEvents, sdTicketComments, sdTimeEntries, sdTicketAttachments, sdContacts, sdProducts, sdInstances,
} from "@shared/schema";
import { hasRole, visibleAccountIds } from "./access";
import { wrap, requireRole, accountOr404, type Req } from "./httpUtil";
import { addComment, addTimeEntry, createTicket, transitionTicket, updateTicket, TicketError } from "./ticketService";
import { validateAttachment } from "./attachments";
import { CHANNELS, SEVERITIES, TICKET_TYPES, nextStatuses, statusesFor } from "./ticketRules";

const WORKERS = ["owner", "support_manager", "agent_l2", "agent_l1"];
const MANAGERS = ["owner", "support_manager"];

const p0Schema = z.object({ inaccessible: z.boolean(), criticalBlocked: z.boolean(), hasWorkaround: z.boolean(), users: z.number().int().min(0) }).partial();
const createSchema = z.object({
  accountId: z.number().int().positive(), type: z.enum(TICKET_TYPES), title: z.string().trim().min(3).max(200),
  description: z.string().max(20000).default(""), productId: z.number().int().positive().nullish(), instanceId: z.number().int().positive().nullish(),
  requesterContactId: z.number().int().positive().nullish(), channel: z.enum(CHANNELS).default("manual"),
  environment: z.enum(["prod", "stg"]).default("prod"), moduleArea: z.string().trim().max(100).default(""),
  severity: z.enum(SEVERITIES).nullish(), perceivedSeverity: z.enum(SEVERITIES).nullish(), p0: p0Schema.nullish(),
  receivedAt: z.coerce.date().nullish(), sharedWithAccount: z.boolean().default(false),
});
const updateSchema = z.object({
  title: z.string().trim().min(3).max(200), description: z.string().max(20000), severity: z.enum(SEVERITIES).nullable(), p0: p0Schema.nullable(),
  priorityInternal: z.number().int().min(1).max(5), assigneeUserId: z.number().int().positive().nullable(),
  moduleArea: z.string().trim().max(100), environment: z.enum(["prod", "stg"]), sharedWithAccount: z.boolean(),
  slaApplicable: z.boolean(), productId: z.number().int().positive().nullable(), instanceId: z.number().int().positive().nullable(),
}).partial().strict();
const rcaSchema = z.object({
  cause: z.string().trim().min(1), fix: z.string().trim().min(1), prevention: z.string().trim().min(1),
  kind: z.enum(["code", "infrastructure", "third_party", "configuration", "usage"]),
});

export function registerTicketRoutes(app: Express, auth: RequestHandler[]) {
  async function ticketOr404(req: Req, res: Response) {
    const id = Number(req.params.id);
    const [t] = Number.isInteger(id) ? await db.select().from(sdTickets).where(eq(sdTickets.id, id)) : [];
    if (!t || !(await visibleAccountIds(req.actor)).includes(t.accountId)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return t;
  }
  const who = (req: Req) => ({ type: "user" as const, id: req.actor.userId });

  app.get("/api/desk/agents", ...auth, wrap(async (req, res) => {
    if (!req.actor.roles.length) return res.json([]);
    const rows = await db.selectDistinct({ id: users.id, username: users.username }).from(users)
      .innerJoin(sql`sd_role_assignments r`, sql`r.user_id = ${users.id}`).where(eq(users.active, true));
    res.json(rows);
  }));

  // Statuses that count as "closed" for the open / no-response filters.
  const CLOSED_SQL = sql`('resolved','closed','duplicate','cancelled','rejected','released','deferred')`;
  const sevRank = sql`case ${sdTickets.severity} when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 else 4 end`;
  const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Fecha inválida");
  const listQuery = z.object({
    status: z.string().optional(), type: z.string().optional(), accountId: z.coerce.number().int().optional(), productId: z.coerce.number().int().optional(),
    severity: z.string().regex(/^(P[0-3]|none)(,(P[0-3]|none))*$/).optional(), channel: z.string().max(30).optional(),
    assignee: z.string().regex(/^(me|none|\d+)$/).optional(), q: z.string().trim().max(100).optional(), open: z.enum(["1", "0"]).optional(),
    noResponse: z.enum(["1", "0"]).optional(), createdFrom: isoDay.optional(), createdTo: isoDay.optional(),
    sort: z.enum(["priority", "created", "updated", "title", "severity", "status", "client"]).default("priority"), dir: z.enum(["asc", "desc"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
  });
  // Calendar day in Mexico City, so "created on the 11th" means the 11th for the people using the desk.
  const mxDay = sql`((${sdTickets.createdAt} at time zone 'UTC') at time zone 'America/Mexico_City')::date`;

  app.get("/api/desk/tickets", ...auth, wrap(async (req, res) => {
    const ids = await visibleAccountIds(req.actor);
    if (!ids.length) return res.json({ rows: [], total: 0 });
    const q = listQuery.parse(req.query);
    const conds = [inArray(sdTickets.accountId, ids)];
    if (q.accountId) conds.push(eq(sdTickets.accountId, q.accountId));
    if (q.productId) conds.push(eq(sdTickets.productId, q.productId));
    if (q.status) conds.push(eq(sdTickets.status, q.status));
    if (q.type) conds.push(eq(sdTickets.type, q.type));
    if (q.severity) {
      const want = q.severity.split(",");
      const levels = want.filter((x) => x !== "none");
      const parts = [...(levels.length ? [inArray(sdTickets.severity, levels)] : []), ...(want.includes("none") ? [sql`${sdTickets.severity} is null`] : [])];
      conds.push(parts.length === 1 ? parts[0] : or(...parts)!);
    }
    if (q.channel) conds.push(eq(sdTickets.channel, q.channel));
    if (q.assignee === "me") conds.push(eq(sdTickets.assigneeUserId, req.actor.userId));
    else if (q.assignee === "none") conds.push(sql`${sdTickets.assigneeUserId} is null`);
    else if (q.assignee) conds.push(eq(sdTickets.assigneeUserId, Number(q.assignee)));
    if (q.open === "1") conds.push(sql`${sdTickets.status} not in ${CLOSED_SQL}`);
    if (q.noResponse === "1") conds.push(sql`${sdTickets.firstResponseAt} is null and ${sdTickets.status} not in ${CLOSED_SQL}`);
    if (q.createdFrom) conds.push(sql`${mxDay} >= ${q.createdFrom}::date`);
    if (q.createdTo) conds.push(sql`${mxDay} <= ${q.createdTo}::date`);
    if (q.q) {
      const like = `%${q.q.replace(/[%_]/g, "\\$&")}%`;
      conds.push(or(ilike(sdTickets.title, like), ilike(sdTickets.key, like), ilike(sdTickets.description, like), ilike(clientes.nombreNegocio, like))!);
    }
    const where = and(...conds);
    const d = (dir: "asc" | "desc") => (q.dir ?? dir) === "asc" ? sql`asc` : sql`desc`;
    const order = {
      priority: [sevRank, desc(sdTickets.updatedAt)],
      severity: [sql`${sevRank} ${d("asc")}`, desc(sdTickets.updatedAt)],
      created: [sql`${sdTickets.createdAt} ${d("desc")}`, desc(sdTickets.id)],
      updated: [sql`${sdTickets.updatedAt} ${d("desc")}`, desc(sdTickets.id)],
      title: [sql`lower(${sdTickets.title}) ${d("asc")}`, desc(sdTickets.id)],
      status: [sql`${sdTickets.status} ${d("asc")}`, desc(sdTickets.updatedAt)],
      client: [sql`lower(${clientes.nombreNegocio}) ${d("asc")}`, desc(sdTickets.updatedAt)],
    }[q.sort];
    const base = db.select({
      id: sdTickets.id, key: sdTickets.key, title: sdTickets.title, type: sdTickets.type, status: sdTickets.status, severity: sdTickets.severity,
      perceivedSeverity: sdTickets.perceivedSeverity, assigneeUserId: sdTickets.assigneeUserId, assigneeName: users.username, accountId: sdTickets.accountId,
      cliente: clientes.nombreNegocio, productCode: sdProducts.code, channel: sdTickets.channel, createdAt: sdTickets.createdAt, updatedAt: sdTickets.updatedAt,
      firstResponseAt: sdTickets.firstResponseAt,
    }).from(sdTickets).innerJoin(sdAccounts, eq(sdAccounts.id, sdTickets.accountId)).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId))
      .leftJoin(sdProducts, eq(sdProducts.id, sdTickets.productId)).leftJoin(users, eq(users.id, sdTickets.assigneeUserId));
    const rows = await base.where(where).orderBy(...order).limit(q.limit).offset(q.offset);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(sdTickets)
      .innerJoin(sdAccounts, eq(sdAccounts.id, sdTickets.accountId)).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(where);
    res.json({ rows, total: n });
  }));

  // Counters for the quick-filter chips (same visibility as the list). Registered before /:id so "summary" is not read as an id.
  app.get("/api/desk/tickets/summary", ...auth, wrap(async (req, res) => {
    const ids = await visibleAccountIds(req.actor);
    if (!ids.length) return res.json({ open: 0, mine: 0, unassigned: 0, critical: 0, noResponse: 0 });
    const open = sql`${sdTickets.status} not in ${CLOSED_SQL}`;
    const [r] = await db.select({
      open: sql<number>`count(*) filter (where ${open})::int`,
      mine: sql<number>`count(*) filter (where ${open} and ${sdTickets.assigneeUserId} = ${req.actor.userId})::int`,
      unassigned: sql<number>`count(*) filter (where ${open} and ${sdTickets.assigneeUserId} is null)::int`,
      critical: sql<number>`count(*) filter (where ${open} and ${sdTickets.severity} in ('P0','P1'))::int`,
      noResponse: sql<number>`count(*) filter (where ${open} and ${sdTickets.firstResponseAt} is null)::int`,
    }).from(sdTickets).where(inArray(sdTickets.accountId, ids));
    res.json(r);
  }));

  app.post("/api/desk/tickets", ...auth, requireRole(...WORKERS), wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    if (!(await accountOr404(req.actor, input.accountId, res))) return;
    const t = await createTicket({ ...input, receivedAt: input.receivedAt ?? null }, who(req));
    res.status(201).json(t);
  }));

  app.get("/api/desk/tickets/:id", ...auth, wrap(async (req, res) => {
    const t = await ticketOr404(req, res); if (!t) return;
    const [events, comments, time, attachments, [requester], [acc], [instance], [product]] = await Promise.all([
      db.select().from(sdTicketEvents).where(eq(sdTicketEvents.ticketId, t.id)).orderBy(sdTicketEvents.id),
      db.select().from(sdTicketComments).where(eq(sdTicketComments.ticketId, t.id)).orderBy(sdTicketComments.id),
      db.select().from(sdTimeEntries).where(eq(sdTimeEntries.ticketId, t.id)).orderBy(sdTimeEntries.id),
      db.select({ id: sdTicketAttachments.id, filename: sdTicketAttachments.filename, mime: sdTicketAttachments.mime, size: sdTicketAttachments.size, visibility: sdTicketAttachments.visibility, createdAt: sdTicketAttachments.createdAt })
        .from(sdTicketAttachments).where(eq(sdTicketAttachments.ticketId, t.id)).orderBy(sdTicketAttachments.id),
      t.requesterContactId ? db.select().from(sdContacts).where(eq(sdContacts.id, t.requesterContactId)) : Promise.resolve([]),
      db.select({ cliente: clientes.nombreNegocio, prefix: sdAccounts.ticketPrefix }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(eq(sdAccounts.id, t.accountId)),
      t.instanceId ? db.select({ name: sdInstances.name, environment: sdInstances.environment, baseUrl: sdInstances.baseUrl }).from(sdInstances).where(eq(sdInstances.id, t.instanceId)) : Promise.resolve([]),
      t.productId ? db.select({ code: sdProducts.code, name: sdProducts.name }).from(sdProducts).where(eq(sdProducts.id, t.productId)) : Promise.resolve([]),
    ]);
    res.json({
      ticket: t, requester: requester ?? null, account: acc, instance: instance ?? null, product: product ?? null, events, comments, time, attachments,
      nextStatuses: nextStatuses(t.type, t.status), allStatuses: statusesFor(t.type),
      totalMinutes: time.reduce((a, e) => a + e.minutes, 0),
    });
  }));

  app.patch("/api/desk/tickets/:id", ...auth, requireRole(...WORKERS), wrap(async (req, res) => {
    const t = await ticketOr404(req, res); if (!t) return;
    const input = updateSchema.parse(req.body);
    if (input.slaApplicable !== undefined && !hasRole(req.actor, ...MANAGERS)) return res.status(403).json({ message: "Solo el gerente puede cambiar la aplicabilidad de SLA" });
    res.json(await updateTicket(t.id, req.actor.userId, input));
  }));

  app.post("/api/desk/tickets/:id/transition", ...auth, requireRole(...WORKERS), wrap(async (req, res) => {
    const t = await ticketOr404(req, res); if (!t) return;
    const b = z.object({ to: z.string(), reason: z.string().trim().max(1000).optional(), rca: rcaSchema.nullish() }).parse(req.body);
    const r = await transitionTicket(t.id, b.to, who(req), { reason: b.reason, rca: b.rca ?? null });
    res.json(r.ticket);
  }));

  app.post("/api/desk/tickets/:id/comments", ...auth, requireRole(...WORKERS), wrap(async (req, res) => {
    const t = await ticketOr404(req, res); if (!t) return;
    const b = z.object({ body: z.string().trim().min(1).max(20000), visibility: z.enum(["public", "internal"]) }).parse(req.body);
    res.status(201).json(await addComment(t.id, who(req), b.body, b.visibility));
  }));

  app.post("/api/desk/tickets/:id/time", ...auth, requireRole(...WORKERS), wrap(async (req, res) => {
    const t = await ticketOr404(req, res); if (!t) return;
    const b = z.object({ minutes: z.number().int(), billable: z.boolean().default(true), workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(500).default("") }).parse(req.body);
    res.status(201).json(await addTimeEntry(t.id, req.actor.userId, b));
  }));

  app.post("/api/desk/tickets/:id/attachments", ...auth, requireRole(...WORKERS), express.raw({ type: () => true, limit: "6mb" }), wrap(async (req, res) => {
    const t = await ticketOr404(req, res); if (!t) return;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const v = validateAttachment(String(req.query.filename ?? "archivo"), String(req.headers["content-type"] ?? ""), body.length);
    if (!v.ok) throw new TicketError(v.error);
    const visibility = req.query.visibility === "internal" ? "internal" : "public";
    const [a] = await db.insert(sdTicketAttachments).values({ ticketId: t.id, visibility, filename: v.filename, mime: v.mime, size: body.length, data: body, uploaderType: "user", uploaderId: req.actor.userId })
      .returning({ id: sdTicketAttachments.id, filename: sdTicketAttachments.filename });
    await db.insert(sdTicketEvents).values({ ticketId: t.id, actorType: "user", actorId: req.actor.userId, kind: "attachment", detail: { attachmentId: a.id, filename: a.filename, visibility } });
    res.status(201).json(a);
  }));

  app.get("/api/desk/attachments/:id", ...auth, wrap(async (req, res) => {
    const [a] = await db.select().from(sdTicketAttachments).where(eq(sdTicketAttachments.id, Number(req.params.id)));
    const [t] = a ? await db.select().from(sdTickets).where(eq(sdTickets.id, a.ticketId)) : [];
    if (!a || !t || !(await visibleAccountIds(req.actor)).includes(t.accountId)) return res.status(404).json({ message: "No encontrado" });
    res.setHeader("Content-Type", a.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(a.filename)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(a.data);
  }));
}
