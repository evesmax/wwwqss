import type { Express, RequestHandler } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { clientes, sdAccounts, sdContacts, sdGateSignoffs, sdProjectGates, sdProjectPhases, sdProjects, sdProjectTasks } from "@shared/schema";
import { visibleAccountIds } from "./access";
import { requireRole, wrap, type Req } from "./httpUtil";
import { writeAudit } from "./audit";
import { TicketError } from "./ticketService";
import { ORIGINS, TEMPLATES, approvePlan, createProject, loadProject, reschedule, scheduleChange } from "./projectService";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rev = z.object({ reason: z.string().max(500), origin: z.enum(ORIGINS) }).partial();
const taskFields = {
  phaseId: z.number().int().positive().nullable(), code: z.string().max(20), name: z.string().trim().min(2).max(200), kind: z.enum(["task", "milestone", "deliverable"]),
  days: z.number().int().min(1).max(500), hours: z.number().min(0).max(5000).nullable(), deps: z.array(z.number().int().positive()).max(50), fixedStart: date.nullable(),
  assigneeUserId: z.number().int().positive().nullable(), assigneeContactId: z.number().int().positive().nullable(), notes: z.string().max(5000),
  clientVisible: z.boolean(), clientSide: z.boolean(), blockedByClient: z.boolean(), pct: z.number().int().min(0).max(100), progressNote: z.string().max(1000),
};
const SCHEDULE_KEYS = ["days", "deps", "fixedStart"];

export function registerProjectRoutes(app: Express, auth: RequestHandler[]) {
  const mgr = requireRole("owner", "support_manager");
  const workers = requireRole("owner", "support_manager", "agent_l2", "agent_l1");

  async function projectOr404(req: Req, res: any) {
    const id = Number(req.params.id);
    const [p] = Number.isInteger(id) ? await db.select().from(sdProjects).where(eq(sdProjects.id, id)) : [];
    if (!p || !(await visibleAccountIds(req.actor)).includes(p.accountId)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return p;
  }
  async function checkRefs(p: typeof sdProjects.$inferSelect, b: any) {
    if (b.phaseId) { const [ph] = await db.select().from(sdProjectPhases).where(and(eq(sdProjectPhases.id, b.phaseId), eq(sdProjectPhases.projectId, p.id))); if (!ph) throw new TicketError("Fase inválida"); }
    if (b.deps?.length) { const ts = await db.select({ id: sdProjectTasks.id }).from(sdProjectTasks).where(and(eq(sdProjectTasks.projectId, p.id), inArray(sdProjectTasks.id, b.deps))); if (ts.length !== new Set(b.deps).size) throw new TicketError("Dependencia inválida"); }
    if (b.assigneeContactId) { const [c] = await db.select().from(sdContacts).where(and(eq(sdContacts.id, b.assigneeContactId), eq(sdContacts.accountId, p.accountId))); if (!c) throw new TicketError("Contacto inválido"); }
    if (b.pct != null && b.pct > 0 && b.pct < 100 && !(b.progressNote ?? "").trim()) throw new TicketError("El avance parcial requiere una nota");
  }

  app.get("/api/desk/project-templates", ...auth, workers, (_req, res) => { res.json(TEMPLATES); });

  app.get("/api/desk/projects", ...auth, workers, wrap(async (req, res) => {
    const ids = await visibleAccountIds(req.actor);
    if (!ids.length) return res.json([]);
    const rows = await db.select({ p: sdProjects, account: clientes.nombreNegocio }).from(sdProjects).innerJoin(sdAccounts, eq(sdAccounts.id, sdProjects.accountId)).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId))
      .where(inArray(sdProjects.accountId, ids)).orderBy(desc(sdProjects.id)).limit(200);
    const out = [];
    for (const r of rows) { const d: any = await loadProject(r.p.id, { client: false }); out.push({ ...r.p, account: r.account, progress: d.progress, warnings: d.warnings.length }); }
    res.json(out);
  }));

  app.post("/api/desk/projects", ...auth, mgr, wrap(async (req, res) => {
    const b = z.object({ accountId: z.number().int().positive(), name: z.string().trim().min(3).max(200), solutionType: z.string().trim().max(60).default(""), startDate: date, template: z.enum(["generic"]).optional() }).parse(req.body);
    if (!(await visibleAccountIds(req.actor)).includes(b.accountId)) return void res.status(404).json({ message: "No encontrado" });
    const p = await createProject(b, req.actor.userId);
    await writeAudit({ actorUserId: req.actor.userId, action: "project.create", entity: "project", entityId: String(p.id) });
    res.status(201).json(p);
  }));

  app.get("/api/desk/projects/:id", ...auth, workers, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    res.json(await loadProject(p.id, { client: false }));
  }));
  app.patch("/api/desk/projects/:id", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = z.object({ name: z.string().trim().min(3).max(200), status: z.enum(["planning", "active", "closed"]) }).partial().strict().parse(req.body);
    await db.update(sdProjects).set(b).where(eq(sdProjects.id, p.id));
    res.json({ ok: true });
  }));
  app.post("/api/desk/projects/:id/approve-plan", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    await approvePlan(p.id, req.actor.userId);
    await writeAudit({ actorUserId: req.actor.userId, action: "project.approve_plan", entity: "project", entityId: String(p.id) });
    res.json({ ok: true });
  }));

  app.post("/api/desk/projects/:id/phases", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(200) }).parse(req.body);
    const n = (await db.select().from(sdProjectPhases).where(eq(sdProjectPhases.projectId, p.id))).length;
    const [row] = await db.insert(sdProjectPhases).values({ projectId: p.id, ...b, position: n }).returning();
    res.status(201).json(row);
  }));

  app.post("/api/desk/projects/:id/tasks", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const raw = req.body ?? {};
    const r = rev.parse({ reason: raw.reason, origin: raw.origin });
    const b = z.object(taskFields).partial().required({ name: true }).parse({ ...raw, reason: undefined, origin: undefined });
    await checkRefs(p, b);
    let created: any;
    await scheduleChange(p.id, req.actor.userId, r.reason && r.origin ? { reason: r.reason, origin: r.origin } : undefined, async () => {
      const n = (await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, p.id))).length;
      [created] = await db.insert(sdProjectTasks).values({ projectId: p.id, name: b.name, phaseId: b.phaseId ?? null, code: b.code ?? "", kind: b.kind ?? "task", days: b.days ?? 1,
        hours: b.hours != null ? String(b.hours) : null, deps: b.deps ?? [], fixedStart: b.fixedStart ?? null, assigneeUserId: b.assigneeUserId ?? null, assigneeContactId: b.assigneeContactId ?? null,
        notes: b.notes ?? "", clientVisible: b.clientVisible ?? true, blockedByClient: b.blockedByClient ?? false, clientSide: b.clientSide ?? false, startDate: p.startDate, endDate: p.startDate, position: n }).returning();
    });
    res.status(201).json(created);
  }));

  async function taskOr404(req: Req, res: any) {
    const p = await projectOr404(req, res); if (!p) return null;
    const tid = Number(req.params.tid);
    const [t] = Number.isInteger(tid) ? await db.select().from(sdProjectTasks).where(and(eq(sdProjectTasks.id, tid), eq(sdProjectTasks.projectId, p.id))) : [];
    if (!t) { res.status(404).json({ message: "No encontrado" }); return null; }
    return { p, t };
  }
  app.patch("/api/desk/projects/:id/tasks/:tid", ...auth, mgr, wrap(async (req, res) => {
    const c = await taskOr404(req, res); if (!c) return;
    const raw = req.body ?? {};
    const r = rev.parse({ reason: raw.reason, origin: raw.origin });
    const b = z.object(taskFields).partial().strict().parse({ ...raw, reason: undefined, origin: undefined });
    if (b.deps?.includes(c.t.id)) throw new TicketError("Una tarea no puede depender de sí misma");
    await checkRefs(c.p, { ...b, pct: b.pct, progressNote: b.progressNote ?? (b.pct != null ? c.t.progressNote : undefined) });
    const set: any = { ...b, updatedAt: new Date() };
    if (b.hours !== undefined) set.hours = b.hours != null ? String(b.hours) : null;
    if (b.pct === 0 || b.pct === 100) set.progressNote = b.progressNote ?? c.t.progressNote;
    const touchesSchedule = SCHEDULE_KEYS.some((k) => (b as any)[k] !== undefined);
    if (touchesSchedule) await scheduleChange(c.p.id, req.actor.userId, r.reason && r.origin ? { reason: r.reason, origin: r.origin } : undefined, async () => { await db.update(sdProjectTasks).set(set).where(eq(sdProjectTasks.id, c.t.id)); });
    else await db.update(sdProjectTasks).set(set).where(eq(sdProjectTasks.id, c.t.id));
    res.json({ ok: true });
  }));
  app.delete("/api/desk/projects/:id/tasks/:tid", ...auth, mgr, wrap(async (req, res) => {
    const c = await taskOr404(req, res); if (!c) return;
    const r = rev.parse({ reason: req.body?.reason, origin: req.body?.origin });
    await scheduleChange(c.p.id, req.actor.userId, r.reason && r.origin ? { reason: r.reason, origin: r.origin } : undefined, async () => {
      const others = await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, c.p.id));
      for (const o of others) if ((o.deps as number[]).includes(c.t.id)) await db.update(sdProjectTasks).set({ deps: (o.deps as number[]).filter((d) => d !== c.t.id) }).where(eq(sdProjectTasks.id, o.id));
      await db.delete(sdProjectTasks).where(eq(sdProjectTasks.id, c.t.id));
    });
    res.json({ ok: true });
  }));

  // gates
  app.post("/api/desk/projects/:id/gates", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = z.object({ phaseId: z.number().int().positive().nullable().default(null), code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(200), date, criteria: z.array(z.string().trim().min(1).max(500)).max(30).default([]) }).parse(req.body);
    await checkRefs(p, b);
    const r = rev.parse({ reason: req.body?.reason, origin: req.body?.origin });
    let row: any;
    await scheduleChange(p.id, req.actor.userId, r.reason && r.origin ? { reason: r.reason, origin: r.origin } : undefined, async () => { [row] = await db.insert(sdProjectGates).values({ projectId: p.id, ...b }).returning(); });
    res.status(201).json(row);
  }));
  app.patch("/api/desk/projects/:id/gates/:gid", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const gid = Number(req.params.gid);
    const [g] = Number.isInteger(gid) ? await db.select().from(sdProjectGates).where(and(eq(sdProjectGates.id, gid), eq(sdProjectGates.projectId, p.id))) : [];
    if (!g) return void res.status(404).json({ message: "No encontrado" });
    if (g.status === "signed") return void res.status(409).json({ message: "El gate ya fue firmado" });
    const b = z.object({ name: z.string().trim().min(2).max(200), date, criteria: z.array(z.string().trim().min(1).max(500)).max(30), evidence: z.array(z.string().trim().min(1).max(500)).max(30), clientVisible: z.boolean() }).partial().strict().parse({ ...req.body, reason: undefined, origin: undefined });
    const r = rev.parse({ reason: req.body?.reason, origin: req.body?.origin });
    if (b.date !== undefined && b.date !== g.date) await scheduleChange(p.id, req.actor.userId, r.reason && r.origin ? { reason: r.reason, origin: r.origin } : undefined, async () => { await db.update(sdProjectGates).set(b).where(eq(sdProjectGates.id, g.id)); });
    else await db.update(sdProjectGates).set(b).where(eq(sdProjectGates.id, g.id));
    res.json({ ok: true });
  }));
  app.get("/api/desk/projects/:id/gates/:gid/signoffs", ...auth, workers, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const rows = await db.select().from(sdGateSignoffs).innerJoin(sdProjectGates, eq(sdProjectGates.id, sdGateSignoffs.gateId)).where(and(eq(sdGateSignoffs.gateId, Number(req.params.gid)), eq(sdProjectGates.projectId, p.id)));
    res.json(rows.map((r) => r.sd_gate_signoffs));
  }));
  app.post("/api/desk/projects/:id/reschedule", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    if (p.baselineVersion >= 1) return void res.status(409).json({ message: "Con línea base aprobada, los cambios se hacen por tarea con motivo y origen" });
    await reschedule(p.id); res.json({ ok: true });
  }));
}
