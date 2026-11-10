import type { Express, RequestHandler } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdMonitors, sdInstances, sdPlatformIncidents, sdPlatformIncidentUpdates, sdMaintenance } from "@shared/schema";
import { requireRole, wrap, type Req } from "./httpUtil";
import { writeAudit } from "./audit";
import { validateMonitorUrl, INCIDENT_STATUSES, IMPACTS, noticeOk } from "./monitorRules";
import { clearStatusCache, monthlyAvailability, notifyMaintenance, publicStatus, runProbes } from "./monitorService";
import { verifyCronToken } from "./slaService";

export function registerMonitorRoutes(app: Express, auth: RequestHandler[]) {
  const mgr = requireRole("owner", "support_manager");
  const global: RequestHandler = (req, res, next) => ((req as Req).actor.scope.global ? next() : void res.status(403).json({ message: "Sin permiso" }));
  const workers = requireRole("owner", "support_manager", "agent_l2", "agent_l1");
  const gm = [...auth, mgr, global];

  // --- public status page (RF-AV-05): only monitors explicitly marked public; no customer data ---
  app.get("/api/status", async (_req, res) => {
    try { res.set("Cache-Control", "public, max-age=30"); res.json(await publicStatus()); }
    catch (e: any) { console.error("status error:", e.message); res.status(500).json({ message: "Error" }); }
  });

  // --- cron: probe from this vantage point; `loc` identifies the location (2+ are needed to declare a minute down) ---
  app.post("/api/internal/probe", async (req, res) => {
    try {
      if (!(await verifyCronToken(String(req.headers["x-tick-token"] ?? "")))) return res.status(401).json({ message: "No autorizado" });
      const loc = z.string().regex(/^[a-z0-9-]{2,40}$/).parse(req.query.loc ?? process.env.PROBE_LOCATION ?? "");
      res.json(await runProbes(loc));
    } catch (e: any) { res.status(e instanceof z.ZodError ? 400 : 500).json({ message: "Error" }); }
  });

  // --- monitors ---
  const monitorSchema = z.object({ instanceId: z.number().int().positive(), name: z.string().trim().min(2).max(100), url: z.string().max(500),
    expectedStatus: z.number().int().min(100).max(599).default(200), isPublic: z.boolean().default(false), active: z.boolean().default(true) });
  app.get("/api/desk/monitors", ...auth, workers, wrap(async (_req, res) => {
    res.json(await db.select({ id: sdMonitors.id, instanceId: sdMonitors.instanceId, instance: sdInstances.name, productId: sdInstances.productId, name: sdMonitors.name, url: sdMonitors.url,
      expectedStatus: sdMonitors.expectedStatus, isPublic: sdMonitors.isPublic, active: sdMonitors.active }).from(sdMonitors).innerJoin(sdInstances, eq(sdInstances.id, sdMonitors.instanceId)).orderBy(sdMonitors.id));
  }));
  app.post("/api/desk/monitors", ...gm, wrap(async (req, res) => {
    const b = monitorSchema.parse(req.body);
    const v = validateMonitorUrl(b.url);
    if (!v.ok) return void res.status(400).json({ message: v.error });
    const [row] = await db.insert(sdMonitors).values({ ...b, url: v.url }).returning();
    await writeAudit({ actorUserId: req.actor.userId, action: "monitor.create", entity: "monitor", entityId: String(row.id), detail: { name: b.name, url: v.url } });
    clearStatusCache(); res.status(201).json(row);
  }));
  app.put("/api/desk/monitors/:id", ...gm, wrap(async (req, res) => {
    const id = Number(req.params.id), b = monitorSchema.omit({ instanceId: true }).parse(req.body);
    const v = validateMonitorUrl(b.url);
    if (!v.ok) return void res.status(400).json({ message: v.error });
    const [row] = Number.isInteger(id) ? await db.update(sdMonitors).set({ ...b, url: v.url }).where(eq(sdMonitors.id, id)).returning() : [];
    if (!row) return void res.status(404).json({ message: "No encontrado" });
    clearStatusCache(); res.json(row);
  }));
  app.delete("/api/desk/monitors/:id", ...gm, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = Number.isInteger(id) ? await db.delete(sdMonitors).where(eq(sdMonitors.id, id)).returning() : [];
    if (!row) return void res.status(404).json({ message: "No encontrado" });
    clearStatusCache(); res.json({ ok: true });
  }));
  app.get("/api/desk/availability", ...auth, workers, wrap(async (req, res) => {
    const q = z.object({ year: z.coerce.number().int().min(2024).max(2100), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
    res.json(await monthlyAvailability(q.year, q.month));
  }));

  // --- platform incidents (RF-AV-04) ---
  app.get("/api/desk/platform-incidents", ...auth, workers, wrap(async (_req, res) => {
    const rows = await db.select().from(sdPlatformIncidents).orderBy(desc(sdPlatformIncidents.id)).limit(100);
    const ups = await db.select().from(sdPlatformIncidentUpdates).orderBy(sdPlatformIncidentUpdates.id);
    res.json(rows.map((i) => ({ ...i, updates: ups.filter((u) => u.incidentId === i.id) })));
  }));
  app.post("/api/desk/platform-incidents", ...gm, wrap(async (req, res) => {
    const b = z.object({ productId: z.number().int().positive(), title: z.string().trim().min(3).max(200), impact: z.enum(IMPACTS).default("minor"),
      isPublic: z.boolean().default(true), body: z.string().trim().min(3).max(5000) }).parse(req.body);
    const [i] = await db.insert(sdPlatformIncidents).values({ productId: b.productId, title: b.title, impact: b.impact, isPublic: b.isPublic, createdBy: req.actor.userId }).returning();
    await db.insert(sdPlatformIncidentUpdates).values({ incidentId: i.id, status: "investigating", body: b.body });
    clearStatusCache(); res.status(201).json(i);
  }));
  app.post("/api/desk/platform-incidents/:id/updates", ...gm, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = z.object({ status: z.enum(INCIDENT_STATUSES), body: z.string().trim().min(3).max(5000),
      rca: z.object({ cause: z.string().trim().min(1), fix: z.string().trim().min(1), prevention: z.string().trim().min(1) }).optional() }).parse(req.body);
    const [cur] = Number.isInteger(id) ? await db.select().from(sdPlatformIncidents).where(eq(sdPlatformIncidents.id, id)) : [];
    if (!cur) return void res.status(404).json({ message: "No encontrado" });
    if (b.status === "resolved" && !b.rca && !cur.rca) return void res.status(400).json({ message: "Para resolver un incidente de plataforma indica causa raíz (causa, corrección, prevención)" });
    await db.insert(sdPlatformIncidentUpdates).values({ incidentId: id, status: b.status, body: b.body });
    const [row] = await db.update(sdPlatformIncidents).set({ status: b.status, resolvedAt: b.status === "resolved" ? new Date() : null, ...(b.rca ? { rca: b.rca } : {}) }).where(eq(sdPlatformIncidents.id, id)).returning();
    clearStatusCache(); res.json(row);
  }));

  // --- scheduled maintenance (RF-AV-06) ---
  app.get("/api/desk/maintenance", ...auth, workers, wrap(async (_req, res) => { res.json(await db.select().from(sdMaintenance).orderBy(desc(sdMaintenance.startsAt)).limit(100)); }));
  app.post("/api/desk/maintenance", ...gm, wrap(async (req, res) => {
    const b = z.object({ productId: z.number().int().positive(), title: z.string().trim().min(3).max(200), startsAt: z.coerce.date(), endsAt: z.coerce.date() }).parse(req.body);
    if (b.endsAt <= b.startsAt) return void res.status(400).json({ message: "El fin debe ser posterior al inicio" });
    if (b.endsAt.getTime() - b.startsAt.getTime() > 24 * 3_600_000) return void res.status(400).json({ message: "Máximo 24 horas por ventana" });
    const now = new Date();
    const [m] = await db.insert(sdMaintenance).values({ ...b, noticeOk: noticeOk(now, b.startsAt), createdBy: req.actor.userId }).returning();
    notifyMaintenance(m).catch((e) => console.error("maintenance notify error:", e.message));
    clearStatusCache(); res.status(201).json({ ...m, warning: m.noticeOk ? null : "Aviso menor a 48 h: no se excluirá del cálculo de disponibilidad" });
  }));
  app.delete("/api/desk/maintenance/:id", ...gm, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = Number.isInteger(id) ? await db.delete(sdMaintenance).where(eq(sdMaintenance.id, id)).returning() : [];
    if (!row) return void res.status(404).json({ message: "No encontrado" });
    clearStatusCache(); res.json({ ok: true });
  }));
}
