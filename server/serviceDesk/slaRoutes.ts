import crypto from "crypto";
import type { Express, RequestHandler } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdTickets, sdTicketEvents, sdSlaPolicies, sdHolidays, sdSlaChanges, sdSettings } from "@shared/schema";
import { hasRole, visibleAccountIds } from "./access";
import { wrap, requireRole, type Req } from "./httpUtil";
import { writeAudit } from "./audit";
import {
  EXCLUSION_REASONS, computeForTicket, cronTokenHash, verifyCronToken, getCalendarSettings, getEscalation, recalcAll, refreshTicketSla, setSetting, slaTick, ticketsWithoutSla,
} from "./slaService";
import { SEVERITIES, TICKET_TYPES } from "./ticketRules";

const WORKERS = ["owner", "support_manager", "agent_l2", "agent_l1"];
const MANAGERS = ["owner", "support_manager"];

const filtersSchema = z.object({
  plans: z.array(z.string()).optional(), productIds: z.array(z.number().int()).optional(), accountIds: z.array(z.number().int()).optional(),
  types: z.array(z.enum(TICKET_TYPES)).optional(), severities: z.array(z.enum(SEVERITIES)).optional(),
}).strict();
const minutes = z.number().int().min(1).max(60 * 24 * 90).nullable();
const policySchema = z.object({
  name: z.string().trim().min(2).max(100), position: z.number().int().min(1).max(10000).default(100), filters: filtersSchema.default({}),
  calendarKind: z.enum(["business", "24x7"]).default("business"), firstResponseMin: minutes, updateMin: minutes, resolutionMin: minutes,
  active: z.boolean().default(true),
});
const calendarSchema = z.object({
  tz: z.string().refine((z) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } }, "Zona horaria inválida"),
  days: z.array(z.number().int().min(0).max(6)).min(1), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).refine((c) => c.start < c.end, "La hora de inicio debe ser menor que la de fin");
const escalationSchema = z.record(z.record(z.array(z.enum(["assignee", "manager", "owner"]))));

const tokenHash = cronTokenHash;

export function registerSlaRoutes(app: Express, auth: RequestHandler[]) {
  const workers = requireRole(...WORKERS), managers = requireRole(...MANAGERS);
  // Global configuration (policies, calendar, escalation, recalc, change log) needs a manager with global scope.
  const globalMgr: RequestHandler = (req, res, next) =>
    hasRole((req as Req).actor, ...MANAGERS) && (req as Req).actor.scope.global ? next() : void res.status(403).json({ message: "Sin permiso" });
  const change = (req: Req, kind: string, detail: object) => db.insert(sdSlaChanges).values({ userId: req.actor.userId, kind, detail });

  // --- policies (RF-SLA-01) ---
  app.get("/api/desk/sla/policies", ...auth, workers, wrap(async (_req, res) => {
    res.json(await db.select().from(sdSlaPolicies).orderBy(sdSlaPolicies.position, sdSlaPolicies.id));
  }));
  app.post("/api/desk/sla/policies", ...auth, globalMgr, wrap(async (req, res) => {
    const b = policySchema.parse(req.body);
    const [row] = await db.insert(sdSlaPolicies).values(b).returning();
    await change(req, "policy_created", { id: row.id, name: row.name });
    await writeAudit({ actorUserId: req.actor.userId, action: "sla.policy.create", entity: "sla_policy", entityId: String(row.id), detail: b });
    res.status(201).json({ policy: row, recalc: await recalcAll(req.actor.userId, `Política creada: ${row.name}`) });
  }));
  app.put("/api/desk/sla/policies/:id", ...auth, globalMgr, wrap(async (req, res) => {
    const id = Number(req.params.id), b = policySchema.parse(req.body);
    const [prev] = Number.isInteger(id) ? await db.select().from(sdSlaPolicies).where(eq(sdSlaPolicies.id, id)) : [];
    if (!prev) return res.status(404).json({ message: "No encontrado" });
    const [row] = await db.update(sdSlaPolicies).set({ ...b, version: prev.version + 1, updatedAt: new Date() }).where(eq(sdSlaPolicies.id, id)).returning();
    await change(req, "policy_updated", { id, from: prev, to: row });
    await writeAudit({ actorUserId: req.actor.userId, action: "sla.policy.update", entity: "sla_policy", entityId: String(id), detail: b });
    res.json({ policy: row, recalc: await recalcAll(req.actor.userId, `Política actualizada: ${row.name} v${row.version}`) });
  }));
  app.delete("/api/desk/sla/policies/:id", ...auth, globalMgr, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = Number.isInteger(id) ? await db.delete(sdSlaPolicies).where(eq(sdSlaPolicies.id, id)).returning() : [];
    if (!row) return res.status(404).json({ message: "No encontrado" });
    await change(req, "policy_deleted", { id, name: row.name });
    await writeAudit({ actorUserId: req.actor.userId, action: "sla.policy.delete", entity: "sla_policy", entityId: String(id) });
    res.json({ ok: true, recalc: await recalcAll(req.actor.userId, `Política eliminada: ${row.name}`) });
  }));

  // --- calendar, holidays, escalation (RF-SLA-03/06) ---
  app.get("/api/desk/sla/calendar", ...auth, workers, wrap(async (req, res) => {
    const vis = await visibleAccountIds(req.actor);
    const hs = (await db.select().from(sdHolidays).orderBy(sdHolidays.date)).filter((h) => h.accountId == null || vis.includes(h.accountId));
    res.json({ calendar: await getCalendarSettings(), holidays: hs, escalation: await getEscalation() });
  }));
  app.put("/api/desk/sla/calendar", ...auth, globalMgr, wrap(async (req, res) => {
    const c = calendarSchema.parse(req.body);
    await setSetting("sla.calendar", c, req.actor.userId);
    await change(req, "calendar_updated", c);
    res.json({ calendar: c, recalc: await recalcAll(req.actor.userId, "Calendario actualizado") });
  }));
  app.post("/api/desk/sla/holidays", ...auth, managers, wrap(async (req, res) => {
    const b = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().max(100).default(""), accountId: z.number().int().positive().nullish() }).parse(req.body);
    if (b.accountId && !(await visibleAccountIds(req.actor)).includes(b.accountId)) return res.status(404).json({ message: "No encontrado" });
    if (!b.accountId && !req.actor.scope.global) return res.status(403).json({ message: "Sin permiso" });
    const [row] = await db.insert(sdHolidays).values({ date: b.date, name: b.name, accountId: b.accountId ?? null }).onConflictDoNothing().returning();
    if (!row) return res.status(409).json({ message: "Ese feriado ya existe" });
    await change(req, "holiday_added", row);
    res.status(201).json({ holiday: row, recalc: await recalcAll(req.actor.userId, `Feriado agregado ${b.date}`) });
  }));
  app.delete("/api/desk/sla/holidays/:id", ...auth, managers, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [cur] = Number.isInteger(id) ? await db.select().from(sdHolidays).where(eq(sdHolidays.id, id)) : [];
    const vis = await visibleAccountIds(req.actor);
    if (!cur || (cur.accountId ? !vis.includes(cur.accountId) : !req.actor.scope.global)) return res.status(404).json({ message: "No encontrado" });
    const [row] = await db.delete(sdHolidays).where(eq(sdHolidays.id, id)).returning();
    await change(req, "holiday_removed", row);
    res.json({ ok: true, recalc: await recalcAll(req.actor.userId, `Feriado eliminado ${row.date}`) });
  }));
  app.put("/api/desk/sla/escalation", ...auth, globalMgr, wrap(async (req, res) => {
    const e = escalationSchema.parse(req.body);
    await setSetting("sla.escalation", e, req.actor.userId);
    await change(req, "escalation_updated", e);
    res.json({ escalation: e });
  }));

  // --- per-ticket view and exclusions (RF-SLA-05/07) ---
  async function visibleTicket(req: Req, res: any) {
    const id = Number(req.params.id);
    const [t] = Number.isInteger(id) ? await db.select().from(sdTickets).where(eq(sdTickets.id, id)) : [];
    if (!t || !(await visibleAccountIds(req.actor)).includes(t.accountId)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return t;
  }
  app.get("/api/desk/tickets/:id/sla", ...auth, workers, wrap(async (req, res) => {
    const t = await visibleTicket(req, res); if (!t) return;
    res.json(await computeForTicket(t.id));
  }));
  app.post("/api/desk/tickets/:id/sla-exclusion", ...auth, managers, wrap(async (req, res) => {
    const t = await visibleTicket(req, res); if (!t) return;
    const b = z.object({ reason: z.enum(EXCLUSION_REASONS), note: z.string().trim().max(1000).default("") }).parse(req.body);
    await db.update(sdTickets).set({ slaApplicable: false, slaExclusionReason: b.reason, slaExcludedBy: req.actor.userId, updatedAt: new Date() }).where(eq(sdTickets.id, t.id));
    await db.insert(sdTicketEvents).values({ ticketId: t.id, actorType: "user", actorId: req.actor.userId, kind: "sla_excluded", detail: b });
    await writeAudit({ actorUserId: req.actor.userId, action: "sla.exclude", entity: "ticket", entityId: String(t.id), detail: b });
    res.json(await refreshTicketSla(t.id));
  }));
  app.delete("/api/desk/tickets/:id/sla-exclusion", ...auth, managers, wrap(async (req, res) => {
    const t = await visibleTicket(req, res); if (!t) return;
    await db.update(sdTickets).set({ slaApplicable: true, slaExclusionReason: null, slaExcludedBy: null, updatedAt: new Date() }).where(eq(sdTickets.id, t.id));
    await db.insert(sdTicketEvents).values({ ticketId: t.id, actorType: "user", actorId: req.actor.userId, kind: "sla_exclusion_removed", detail: {} });
    await writeAudit({ actorUserId: req.actor.userId, action: "sla.exclude.remove", entity: "ticket", entityId: String(t.id) });
    res.json(await refreshTicketSla(t.id));
  }));

  // --- control reports ---
  app.get("/api/desk/sla/no-policy", ...auth, workers, wrap(async (req, res) => {
    const ids = new Set(await visibleAccountIds(req.actor));
    res.json((await ticketsWithoutSla()).filter((t) => ids.has(t.accountId)));
  }));
  app.get("/api/desk/sla/exclusions", ...auth, workers, wrap(async (req, res) => {
    const ids = await visibleAccountIds(req.actor);
    if (!ids.length) return res.json([]);
    const rows = await db.select({ id: sdTickets.id, key: sdTickets.key, reason: sdTickets.slaExclusionReason, accountId: sdTickets.accountId, by: sdTickets.slaExcludedBy })
      .from(sdTickets).where(eq(sdTickets.slaApplicable, false));
    res.json(rows.filter((r) => r.reason && ids.includes(r.accountId)));
  }));
  app.get("/api/desk/sla/changes", ...auth, globalMgr, wrap(async (_req, res) => {
    res.json(await db.select().from(sdSlaChanges).orderBy(desc(sdSlaChanges.id)).limit(100));
  }));
  app.post("/api/desk/sla/recalc", ...auth, globalMgr, wrap(async (req, res) => {
    res.json(await recalcAll(req.actor.userId, String(req.body?.reason ?? "Recálculo manual").slice(0, 200)));
  }));

  // --- cron tick (Cloud Scheduler) ---
  app.post("/api/desk/sla/tick-token", ...auth, requireRole("owner"), wrap(async (req, res) => {
    const token = crypto.randomBytes(32).toString("hex");
    await setSetting("sla.tickTokenHash", tokenHash(token), req.actor.userId);
    await writeAudit({ actorUserId: req.actor.userId, action: "sla.tick_token.rotate", entity: "settings" });
    res.json({ token }); // shown once; only its hash is stored
  }));
  app.post("/api/internal/sla/tick", async (req, res) => {
    try {
      if (!(await verifyCronToken(String(req.headers["x-tick-token"] ?? "")))) return res.status(401).json({ message: "No autorizado" });
      res.json(await slaTick());
    } catch (e: any) { console.error("sla tick route error:", e.message); res.status(500).json({ message: "Error" }); }
  });
}
