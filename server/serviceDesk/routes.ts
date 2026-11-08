import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  users, clientes, sdProducts, sdAccounts, sdInstances, sdContracts, sdContacts, sdRoleAssignments,
} from "@shared/schema";
import { loadActor, canAccessAccount, hasRole, type Actor } from "./access";
import { writeAudit } from "./audit";
import { getSmtpPublic, saveSmtpConfig } from "./settings";
import { sendEmail } from "./emailService";

export const DESK_ROLES = ["owner", "support_manager", "agent_l2", "agent_l1", "finance", "readonly"] as const;
const SCOPE_TYPES = ["global", "product", "account"] as const;
const ACCOUNT_TYPES = ["suscripcion", "proyecto", "bolsa_horas", "demo", "interno"] as const;
const WRITERS = ["owner", "support_manager"];
// Role gates (hasRole) ignore scope, so these roles must never be scoped.
const GLOBAL_ONLY_ROLES: string[] = ["owner", "support_manager"];

type Req = Request & { actor: Actor };

async function accountProductMap(): Promise<Map<number, number[]>> {
  const map = new Map<number, Set<number>>();
  const add = (a: number, p: number) => { if (!map.has(a)) map.set(a, new Set()); map.get(a)!.add(p); };
  for (const c of await db.select({ a: sdContracts.accountId, p: sdContracts.productId }).from(sdContracts)) add(c.a, c.p);
  for (const i of await db.select({ a: sdInstances.accountId, p: sdInstances.productId }).from(sdInstances)) add(i.a, i.p);
  return new Map(Array.from(map.entries()).map(([a, s]) => [a, Array.from(s)]));
}

async function visibleAccountIds(actor: Actor): Promise<number[]> {
  if (!actor.roles.length) return [];
  const all = await db.select({ id: sdAccounts.id }).from(sdAccounts);
  if (actor.scope.global) return all.map((a) => a.id);
  const pm = await accountProductMap();
  return all.filter((a) => canAccessAccount(actor, a.id, pm.get(a.id) ?? [])).map((a) => a.id);
}

// Out-of-scope and non-existent accounts are indistinguishable: 404 either way.
async function accountOr404(actor: Actor, accountId: number, res: Response): Promise<boolean> {
  if (!Number.isInteger(accountId) || !(await visibleAccountIds(actor)).includes(accountId)) {
    res.status(404).json({ message: "No encontrado" });
    return false;
  }
  return true;
}

const wrap = (fn: (req: Req, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) =>
  fn(req as Req, res).catch((e) => {
    if (e instanceof z.ZodError) return res.status(400).json({ message: "Datos inválidos", issues: e.issues });
    console.error("desk route error:", e);
    next(e);
  });

const requireRole = (...roles: string[]): RequestHandler => (req, res, next) =>
  hasRole((req as Req).actor, ...roles) ? next() : void res.status(403).json({ message: "Sin permiso" });

export const assignSchema = z.object({
  assignments: z.array(z.object({
    role: z.enum(DESK_ROLES), scopeType: z.enum(SCOPE_TYPES), scopeId: z.number().int().positive().nullable().default(null),
  }).refine((a) => (a.scopeType === "global") === (a.scopeId === null), { message: "scopeId requerido salvo en alcance global" })
    .refine((a) => !GLOBAL_ONLY_ROLES.includes(a.role) || a.scopeType === "global", { message: "owner y support_manager solo con alcance global" })),
});

export function registerDeskRoutes(app: Express, requireAuth: RequestHandler) {
  const deskAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = await loadActor(req.session.userId!);
      if (!actor) return res.status(401).json({ message: "No autorizado" });
      if (actor.roles.length) {
        const [u] = await db.select({ t: users.totpEnabled }).from(users).where(eq(users.id, actor.userId));
        if (!u?.t) return res.status(403).json({ code: "mfa_required", message: "Activa la verificación en dos pasos para usar Soporte" });
      }
      (req as Req).actor = actor;
      next();
    } catch (e) { next(e); }
  };
  const auth = [requireAuth, deskAuth];

  app.get("/api/desk/me", ...auth, wrap(async (req, res) => {
    const { actor } = req;
    res.json({ roles: actor.roles, global: actor.scope.global, accountIds: Array.from(actor.scope.accountIds), productIds: Array.from(actor.scope.productIds) });
  }));

  // ---- SMTP (owner only) ----
  const smtpSchema = z.object({
    host: z.string().trim().min(1), port: z.coerce.number().int().min(1).max(65535), secure: z.boolean(),
    user: z.string().trim().default(""), password: z.string().optional(),
    fromName: z.string().trim().default(""), fromEmail: z.string().trim().email(),
  });
  app.get("/api/desk/settings/smtp", ...auth, requireRole("owner"), wrap(async (_req, res) => {
    res.json((await getSmtpPublic()) ?? null);
  }));
  app.put("/api/desk/settings/smtp", ...auth, requireRole("owner"), wrap(async (req, res) => {
    const input = smtpSchema.parse(req.body);
    await saveSmtpConfig(input, req.actor.userId);
    await writeAudit({ actorUserId: req.actor.userId, action: "smtp.updated", entity: "settings", entityId: "smtp", detail: { host: input.host, port: input.port, user: input.user, passwordChanged: !!input.password } });
    res.json((await getSmtpPublic())!);
  }));
  app.post("/api/desk/settings/smtp/test", ...auth, requireRole("owner"), wrap(async (req, res) => {
    const { to } = z.object({ to: z.string().trim().email() }).parse(req.body);
    const r = await sendEmail({ to, subject: "Prueba de correo — QSS Soporte", html: "<p>Si recibes este mensaje, la configuración SMTP funciona.</p>" });
    res.json(r);
  }));

  // ---- Products ----
  const productSchema = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1), active: z.boolean().default(true) });
  app.get("/api/desk/products", ...auth, wrap(async (req, res) => {
    res.json(req.actor.roles.length ? await db.select().from(sdProducts) : []);
  }));
  app.post("/api/desk/products", ...auth, requireRole(...WRITERS), wrap(async (req, res) => {
    const [row] = await db.insert(sdProducts).values(productSchema.parse(req.body)).returning();
    await writeAudit({ actorUserId: req.actor.userId, action: "product.created", entity: "sd_products", entityId: String(row.id), detail: row });
    res.status(201).json(row);
  }));
  app.put("/api/desk/products/:id", ...auth, requireRole(...WRITERS), wrap(async (req, res) => {
    const [row] = await db.update(sdProducts).set(productSchema.parse(req.body)).where(eq(sdProducts.id, Number(req.params.id))).returning();
    if (!row) return res.status(404).json({ message: "No encontrado" });
    await writeAudit({ actorUserId: req.actor.userId, action: "product.updated", entity: "sd_products", entityId: String(row.id), detail: row });
    res.json(row);
  }));

  // ---- Accounts ----
  const accountSchema = z.object({
    clienteId: z.number().int().positive(), accountType: z.enum(ACCOUNT_TYPES),
    ticketPrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/), active: z.boolean().default(true),
  });
  app.get("/api/desk/accounts", ...auth, wrap(async (req, res) => {
    const ids = await visibleAccountIds(req.actor);
    if (!ids.length) return res.json([]);
    const rows = await db.select({
      id: sdAccounts.id, clienteId: sdAccounts.clienteId, accountType: sdAccounts.accountType,
      ticketPrefix: sdAccounts.ticketPrefix, active: sdAccounts.active, nombre: clientes.nombreNegocio, codigo: clientes.codigo,
    }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(inArray(sdAccounts.id, ids));
    res.json(rows);
  }));
  app.post("/api/desk/accounts", ...auth, requireRole(...WRITERS), wrap(async (req, res) => {
    const [row] = await db.insert(sdAccounts).values(accountSchema.parse(req.body)).returning();
    await writeAudit({ actorUserId: req.actor.userId, action: "account.created", entity: "sd_accounts", entityId: String(row.id), detail: row });
    res.status(201).json(row);
  }));
  app.put("/api/desk/accounts/:id", ...auth, requireRole(...WRITERS), wrap(async (req, res) => {
    if (!(await accountOr404(req.actor, Number(req.params.id), res))) return;
    const { clienteId: _ignored, ...rest } = accountSchema.parse(req.body);
    const [row] = await db.update(sdAccounts).set(rest).where(eq(sdAccounts.id, Number(req.params.id))).returning();
    await writeAudit({ actorUserId: req.actor.userId, action: "account.updated", entity: "sd_accounts", entityId: String(row.id), detail: row });
    res.json(row);
  }));

  // ---- Per-account children: instances, contracts, contacts ----
  const children = {
    instances: {
      table: sdInstances,
      schema: z.object({ accountId: z.number().int().positive(), productId: z.number().int().positive(), name: z.string().trim().min(1),
        environment: z.enum(["prod", "staging"]).default("prod"), baseUrl: z.string().trim().default(""), active: z.boolean().default(true) }),
    },
    contracts: {
      table: sdContracts,
      schema: z.object({ accountId: z.number().int().positive(), productId: z.number().int().positive(), plan: z.string().trim().min(1).default("estandar"),
        slaActiveFrom: z.coerce.date().nullable().default(null), calendar: z.string().trim().default("America/Mexico_City"),
        reportRecipients: z.array(z.string().email()).default([]), hoursBank: z.coerce.string().nullable().default(null), active: z.boolean().default(true) }),
    },
    contacts: {
      table: sdContacts,
      schema: z.object({ accountId: z.number().int().positive(), email: z.string().trim().toLowerCase().email(), name: z.string().trim().default(""),
        role: z.enum(["account_admin", "contact", "reporter"]).default("contact") }),
    },
  } as const;

  for (const [name, cfg] of Object.entries(children)) {
    const t: any = cfg.table;
    const path = `/api/desk/${name}`;
    app.get(path, ...auth, wrap(async (req, res) => {
      const accountId = Number(req.query.accountId);
      if (!(await accountOr404(req.actor, accountId, res))) return;
      res.json((await db.select().from(t).where(eq(t.accountId, accountId))) as any[]);
    }));
    app.post(path, ...auth, requireRole(...WRITERS), wrap(async (req, res) => {
      const data = (cfg.schema as z.ZodTypeAny).parse(req.body);
      if (!(await accountOr404(req.actor, data.accountId, res))) return;
      const [row] = (await db.insert(t).values(data).returning()) as any[];
      await writeAudit({ actorUserId: req.actor.userId, action: `${name}.created`, entity: `sd_${name}`, entityId: String(row.id), detail: row });
      res.status(201).json(row);
    }));
    app.put(`${path}/:id`, ...auth, requireRole(...WRITERS), wrap(async (req, res) => {
      const id = Number(req.params.id);
      const [cur] = (await db.select().from(t).where(eq(t.id, id))) as any[];
      if (!cur || !(await accountOr404(req.actor, cur.accountId, res))) return !cur && void res.status(404).json({ message: "No encontrado" });
      const { accountId: _a, ...data } = (cfg.schema as z.ZodTypeAny).parse({ ...req.body, accountId: cur.accountId });
      const [row] = (await db.update(t).set(data).where(eq(t.id, id)).returning()) as any[];
      await writeAudit({ actorUserId: req.actor.userId, action: `${name}.updated`, entity: `sd_${name}`, entityId: String(id), detail: row });
      res.json(row);
    }));
    app.delete(`${path}/:id`, ...auth, requireRole(...WRITERS), wrap(async (req, res) => {
      const id = Number(req.params.id);
      const [cur] = (await db.select().from(t).where(eq(t.id, id))) as any[];
      if (!cur) return res.status(404).json({ message: "No encontrado" });
      if (!(await accountOr404(req.actor, cur.accountId, res))) return;
      await db.delete(t).where(eq(t.id, id));
      await writeAudit({ actorUserId: req.actor.userId, action: `${name}.deleted`, entity: `sd_${name}`, entityId: String(id), detail: cur });
      res.json({ ok: true });
    }));
  }

  // ---- Role assignments (owner only) ----
  app.get("/api/desk/users", ...auth, requireRole("owner"), wrap(async (_req, res) => {
    const us = await db.select({ id: users.id, username: users.username, fullName: users.fullName, active: users.active }).from(users);
    const as = await db.select().from(sdRoleAssignments);
    res.json(us.map((u) => ({ ...u, assignments: as.filter((a) => a.userId === u.id).map(({ role, scopeType, scopeId }) => ({ role, scopeType, scopeId })) })));
  }));
  app.put("/api/desk/users/:id/assignments", ...auth, requireRole("owner"), wrap(async (req, res) => {
    const userId = Number(req.params.id);
    const { assignments } = assignSchema.parse(req.body);
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!u) return res.status(404).json({ message: "No encontrado" });
    const keepsOwner = assignments.some((a) => a.role === "owner");
    if (userId === req.actor.userId && !keepsOwner) return res.status(400).json({ message: "No puedes quitarte el rol de Owner a ti mismo" });
    await db.transaction(async (tx) => {
      await tx.delete(sdRoleAssignments).where(eq(sdRoleAssignments.userId, userId));
      if (assignments.length) await tx.insert(sdRoleAssignments).values(assignments.map((a) => ({ ...a, userId })));
    });
    await writeAudit({ actorUserId: req.actor.userId, action: "assignments.replaced", entity: "user", entityId: String(userId), detail: { assignments } });
    res.json({ ok: true });
  }));
}
