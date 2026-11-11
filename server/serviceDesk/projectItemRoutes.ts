import type { Express, RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdProjectDecisions, sdProjectDocs, sdProjectModules, sdProjectPayments, sdProjectRisks, sdProjects, sdProjectTasks } from "@shared/schema";
import { visibleAccountIds } from "./access";
import { requireRole, wrap, type Req } from "./httpUtil";
import { TicketError } from "./ticketService";
import {
  acceptDefault, audit, auditVisibility, checkTasks, createDecision, createDoc, createModule, createPayment, decide, loadByResource, moduleCatalog, PAYMENT_STATUSES, riskView, setModuleStatus, syncBlocked, updateDoc,
} from "./projectItemService";
import { DOC_PRIORITIES, DOC_STATUSES } from "./projectItemRules";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerProjectItemRoutes(app: Express, auth: RequestHandler[]) {
  const mgr = requireRole("owner", "support_manager");
  const workers = requireRole("owner", "support_manager", "agent_l2", "agent_l1");
  async function projectOr404(req: Req, res: any, id = Number(req.params.id)) {
    const [p] = Number.isInteger(id) ? await db.select().from(sdProjects).where(eq(sdProjects.id, id)) : [];
    if (!p || !(await visibleAccountIds(req.actor)).includes(p.accountId)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return p;
  }
  // Loads an item and checks the actor can see its project.
  async function itemOr404<T extends { projectId: number }>(req: Req, res: any, tbl: any): Promise<T | null> {
    const id = Number(req.params.iid);
    const [row] = Number.isInteger(id) ? await db.select().from(tbl).where(eq(tbl.id, id)) : [];
    if (!row || !(await projectOr404(req, res, (row as any).projectId))) return null;
    return row as T;
  }

  // ---- DOC-xx ----
  const docBody = z.object({ name: z.string().trim().min(3).max(200), priority: z.enum(DOC_PRIORITIES), dueDate: date, ownerContactId: z.number().int().positive().nullable(), clientVisible: z.boolean() });
  app.post("/api/desk/projects/:id/docs", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = docBody.partial().required({ name: true, priority: true, dueDate: true }).parse(req.body);
    res.status(201).json(await createDoc(p.id, req.actor.userId, b as any));
  }));
  app.patch("/api/desk/projects/:id/docs/:iid", ...auth, mgr, wrap(async (req, res) => {
    const d = await itemOr404<typeof sdProjectDocs.$inferSelect>(req, res, sdProjectDocs); if (!d || d.projectId !== Number(req.params.id)) return void (res.headersSent || res.status(404).json({ message: "No encontrado" }));
    const b = docBody.partial().extend({ status: z.enum(DOC_STATUSES), files: z.array(z.string().max(500)).max(30), comment: z.string().max(2000) }).partial().strict().parse(req.body);
    await updateDoc(d.id, { type: "user", id: req.actor.userId }, b as any); res.json({ ok: true });
  }));
  app.put("/api/desk/projects/:id/tasks/:tid/docs", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = z.object({ docIds: z.array(z.number().int().positive()).max(30) }).parse(req.body);
    const ds = await db.select({ id: sdProjectDocs.id }).from(sdProjectDocs).where(eq(sdProjectDocs.projectId, p.id));
    if (!b.docIds.every((x) => ds.some((d) => d.id === x))) throw new TicketError("Documento inválido");
    const r = await db.update(sdProjectTasks).set({ docIds: b.docIds }).where(and(eq(sdProjectTasks.id, Number(req.params.tid)), eq(sdProjectTasks.projectId, p.id))).returning({ id: sdProjectTasks.id });
    if (!r.length) return void res.status(404).json({ message: "No encontrado" });
    await syncBlocked(p.id); res.json({ ok: true });
  }));

  // ---- P-xx ----
  app.post("/api/desk/projects/:id/decisions", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = z.object({ question: z.string().trim().min(5).max(1000), options: z.array(z.string().max(300)).max(10).default([]), defaultDecision: z.string().trim().min(1).max(500), deadline: date, decider: z.string().max(200).default(""), clientVisible: z.boolean().default(true) }).parse(req.body);
    res.status(201).json(await createDecision(p.id, req.actor.userId, b));
  }));
  app.post("/api/desk/projects/:id/decisions/:iid/decide", ...auth, mgr, wrap(async (req, res) => {
    const d = await itemOr404<typeof sdProjectDecisions.$inferSelect>(req, res, sdProjectDecisions); if (!d) return;
    const b = z.object({ decision: z.string().trim().min(1).max(1000), impact: z.string().max(1000).default("") }).parse(req.body);
    await decide(d.id, { type: "user", id: req.actor.userId }, b.decision, b.impact); res.json({ ok: true });
  }));
  app.post("/api/desk/projects/:id/decisions/:iid/accept-default", ...auth, mgr, wrap(async (req, res) => {
    const d = await itemOr404<typeof sdProjectDecisions.$inferSelect>(req, res, sdProjectDecisions); if (!d) return;
    await acceptDefault(d.id, req.actor.userId); res.json({ ok: true });
  }));
  app.patch("/api/desk/projects/:id/decisions/:iid", ...auth, mgr, wrap(async (req, res) => {
    const d = await itemOr404<typeof sdProjectDecisions.$inferSelect>(req, res, sdProjectDecisions); if (!d) return;
    if (d.status !== "open") throw new TicketError("La decisión ya fue tomada", 409);
    const b = z.object({ question: z.string().trim().min(5).max(1000), options: z.array(z.string().max(300)).max(10), defaultDecision: z.string().trim().min(1).max(500), deadline: date, decider: z.string().max(200), impact: z.string().max(1000), clientVisible: z.boolean() }).partial().strict().parse(req.body);
    if (b.clientVisible !== undefined) await auditVisibility(d.projectId, req.actor.userId, "decision", d.id, d.clientVisible, b.clientVisible);
    if (b.deadline !== undefined) (b as any).notifiedAt = null;
    await db.update(sdProjectDecisions).set(b as any).where(eq(sdProjectDecisions.id, d.id)); res.json({ ok: true });
  }));

  // ---- R-xx ----
  const riskBody = z.object({ title: z.string().trim().min(3).max(300), probability: z.number().int().min(1).max(3), impact: z.number().int().min(1).max(3), ownerUserId: z.number().int().positive().nullable(), mitigation: z.string().max(2000), triggerText: z.string().max(1000), status: z.enum(["open", "mitigated", "occurred", "closed"]), taskIds: z.array(z.number().int().positive()).max(50), shared: z.boolean() });
  app.post("/api/desk/projects/:id/risks", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const { createRisk } = await import("./projectItemService");
    const b = riskBody.partial().required({ title: true, probability: true, impact: true }).parse(req.body);
    res.status(201).json(riskView(await createRisk(p.id, req.actor.userId, b as any)));
  }));
  app.patch("/api/desk/projects/:id/risks/:iid", ...auth, mgr, wrap(async (req, res) => {
    const r = await itemOr404<typeof sdProjectRisks.$inferSelect>(req, res, sdProjectRisks); if (!r) return;
    const b = riskBody.partial().strict().parse(req.body);
    if (b.taskIds) await checkTasks(r.projectId, b.taskIds);
    if (b.shared !== undefined) await auditVisibility(r.projectId, req.actor.userId, "risk", r.id, r.shared, b.shared);
    await db.update(sdProjectRisks).set(b as any).where(eq(sdProjectRisks.id, r.id)); res.json({ ok: true });
  }));
  app.delete("/api/desk/projects/:id/risks/:iid", ...auth, mgr, wrap(async (req, res) => {
    const r = await itemOr404<typeof sdProjectRisks.$inferSelect>(req, res, sdProjectRisks); if (!r) return;
    await db.delete(sdProjectRisks).where(eq(sdProjectRisks.id, r.id)); await audit(r.projectId, req.actor.userId, "risk", r.id, "delete", { code: r.code }); res.json({ ok: true });
  }));

  // ---- MOD-xx ----
  app.post("/api/desk/projects/:id/modules", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(1000).default("") }).parse(req.body);
    res.status(201).json(await createModule(p.id, req.actor.userId, b));
  }));
  app.patch("/api/desk/projects/:id/modules/:iid", ...auth, mgr, wrap(async (req, res) => {
    const m = await itemOr404<typeof sdProjectModules.$inferSelect>(req, res, sdProjectModules); if (!m) return;
    const b = z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(1000), status: z.string() }).partial().strict().parse(req.body);
    const { status, ...rest } = b;
    if (Object.keys(rest).length) await db.update(sdProjectModules).set(rest).where(eq(sdProjectModules.id, m.id));
    if (status) await setModuleStatus(m.id, req.actor.userId, status);
    res.json({ ok: true });
  }));
  app.get("/api/desk/accounts/:id/modules", ...auth, workers, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !(await visibleAccountIds(req.actor)).includes(id)) return void res.status(404).json({ message: "No encontrado" });
    res.json(await moduleCatalog(id));
  }));

  // ---- payments (internal; mirrored from QFactura Hub) ----
  const payBody = z.object({ name: z.string().trim().min(2).max(200), amount: z.number().min(0), currency: z.string().length(3), dueDate: date, gateId: z.number().int().positive().nullable(), deliverable: z.string().max(500), status: z.enum(PAYMENT_STATUSES), clientVisible: z.boolean() });
  app.post("/api/desk/projects/:id/payments", ...auth, mgr, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    const b = payBody.partial().required({ name: true, amount: true, dueDate: true }).parse(req.body);
    res.status(201).json(await createPayment(p.id, req.actor.userId, b as any));
  }));
  app.patch("/api/desk/projects/:id/payments/:iid", ...auth, mgr, wrap(async (req, res) => {
    const x = await itemOr404<typeof sdProjectPayments.$inferSelect>(req, res, sdProjectPayments); if (!x) return;
    const b = payBody.partial().strict().parse(req.body);
    const set: any = { ...b }; if (b.amount !== undefined) set.amount = String(b.amount);
    if (b.clientVisible !== undefined) await auditVisibility(x.projectId, req.actor.userId, "payment", x.id, x.clientVisible, b.clientVisible);
    await db.update(sdProjectPayments).set(set).where(eq(sdProjectPayments.id, x.id)); res.json({ ok: true });
  }));
  app.delete("/api/desk/projects/:id/payments/:iid", ...auth, mgr, wrap(async (req, res) => {
    const x = await itemOr404<typeof sdProjectPayments.$inferSelect>(req, res, sdProjectPayments); if (!x) return;
    await db.delete(sdProjectPayments).where(eq(sdProjectPayments.id, x.id)); res.json({ ok: true });
  }));

  // ---- resource load (internal) ----
  app.get("/api/desk/projects/:id/load", ...auth, workers, wrap(async (req, res) => {
    const p = await projectOr404(req, res); if (!p) return;
    res.json(await loadByResource(p.id));
  }));
}
