import type { Express, RequestHandler } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { clientes, sdAccounts, sdFeatureDates, sdFeatureQuotes, sdFeatureRequests, sdFeatures, sdTickets, sdUatItems } from "@shared/schema";
import { hasRole, visibleAccountIds } from "./access";
import { requireRole, wrap, type Req } from "./httpUtil";
import { writeAudit } from "./audit";
import { quoteState } from "./featureRules";
import {
  FEATURE_PATCH_STATUSES, addRequest, addUatItem, bankSummary, createFeature, createQuote, manualRelease, quoteDue, sendQuote, setTargetDate, startUat, updateQuote,
} from "./featureService";

const quoteSchema = z.object({
  scope: z.string(), hours: z.coerce.number(), cost: z.coerce.number(), currency: z.string().default("MXN"),
  assumptions: z.string().max(5000).default(""), validUntil: z.string(), outOfContract: z.boolean().default(false),
});

export function registerFeatureRoutes(app: Express, auth: RequestHandler[]) {
  const mgr = requireRole("owner", "support_manager");
  const workers = requireRole("owner", "support_manager", "agent_l2", "agent_l1");
  const global = (req: Req) => req.actor.scope.global;

  // A feature is visible when one of its requesting accounts is in scope; feature-less shells only to global managers.
  async function featureOr404(req: Req, res: any) {
    const id = Number(req.params.id);
    const [f] = Number.isInteger(id) ? await db.select().from(sdFeatures).where(eq(sdFeatures.id, id)) : [];
    if (!f) { res.status(404).json({ message: "No encontrado" }); return null; }
    const vis = await visibleAccountIds(req.actor);
    const reqs = await db.select().from(sdFeatureRequests).where(eq(sdFeatureRequests.featureId, id));
    const ok = reqs.length ? reqs.some((r) => vis.includes(r.accountId)) : (hasRole(req.actor, "owner", "support_manager") && global(req));
    if (!ok) { res.status(404).json({ message: "No encontrado" }); return null; }
    return { f, reqs, vis };
  }
  async function accountNames(ids: number[]) {
    if (!ids.length) return new Map<number, string>();
    const rows = await db.select({ id: sdAccounts.id, name: clientes.nombreNegocio }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(inArray(sdAccounts.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  app.get("/api/desk/features", ...auth, workers, wrap(async (req, res) => {
    const vis = await visibleAccountIds(req.actor);
    const feats = await db.select().from(sdFeatures).orderBy(desc(sdFeatures.updatedAt)).limit(500);
    const reqs = feats.length ? await db.select().from(sdFeatureRequests).where(inArray(sdFeatureRequests.featureId, feats.map((f) => f.id))) : [];
    const now = new Date();
    const out = [];
    for (const f of feats) {
      const rs = reqs.filter((r) => r.featureId === f.id);
      if (rs.length ? !rs.some((r) => vis.includes(r.accountId)) : !(hasRole(req.actor, "owner", "support_manager") && global(req))) continue;
      const due = await quoteDue(f.createdAt);
      out.push({ ...f, requests: rs.length, accounts: new Set(rs.map((r) => r.accountId)).size, weight: rs.reduce((s, r) => s + r.weight, 0),
        quoteDue: due, quoteOverdue: f.status === "evaluating" && due < now });
    }
    out.sort((a, b) => b.weight - a.weight);
    res.json(out);
  }));

  app.post("/api/desk/features", ...auth, mgr, wrap(async (req, res) => {
    const b = z.object({ title: z.string().trim().min(3).max(200), description: z.string().max(20000).default(""), productId: z.number().int().positive().nullish(), ticketIds: z.array(z.number().int().positive()).max(100).default([]) }).parse(req.body);
    const vis = await visibleAccountIds(req.actor);
    const ts = b.ticketIds.length ? await db.select({ id: sdTickets.id, a: sdTickets.accountId }).from(sdTickets).where(inArray(sdTickets.id, b.ticketIds)) : [];
    if (ts.length !== new Set(b.ticketIds).size || ts.some((t) => !vis.includes(t.a))) return void res.status(404).json({ message: "No encontrado" });
    const f = await createFeature({ title: b.title, description: b.description, productId: b.productId ?? null, ticketIds: b.ticketIds }, req.actor.userId);
    await writeAudit({ actorUserId: req.actor.userId, action: "feature.create", entity: "feature", entityId: String(f.id) });
    res.status(201).json(f);
  }));

  app.get("/api/desk/features/:id", ...auth, workers, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    const { f, reqs, vis } = c;
    const rs = reqs.filter((r) => vis.includes(r.accountId));
    const tix = rs.length ? await db.select({ id: sdTickets.id, key: sdTickets.key, title: sdTickets.title, status: sdTickets.status }).from(sdTickets).where(inArray(sdTickets.id, rs.map((r) => r.ticketId))) : [];
    const names = await accountNames(Array.from(new Set(rs.map((r) => r.accountId))));
    const quotes = (await db.select().from(sdFeatureQuotes).where(eq(sdFeatureQuotes.featureId, f.id)).orderBy(desc(sdFeatureQuotes.id))).filter((q) => vis.includes(q.accountId));
    const uat = (await db.select().from(sdUatItems).where(eq(sdUatItems.featureId, f.id)).orderBy(asc(sdUatItems.position))).filter((u) => vis.includes(u.accountId));
    const dates = await db.select().from(sdFeatureDates).where(eq(sdFeatureDates.featureId, f.id)).orderBy(desc(sdFeatureDates.id));
    res.json({
      feature: f, quoteDue: await quoteDue(f.createdAt), dates,
      requests: rs.map((r) => ({ ...r, ticket: tix.find((t) => t.id === r.ticketId), account: names.get(r.accountId) })),
      quotes: quotes.map((q) => ({ ...q, state: quoteState(q), account: names.get(q.accountId) })),
      uat: uat.map((u) => ({ ...u, account: names.get(u.accountId) })),
    });
  }));

  app.patch("/api/desk/features/:id", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    const b = z.object({ title: z.string().trim().min(3).max(200), description: z.string().max(20000), outOfContract: z.boolean(), status: z.enum(FEATURE_PATCH_STATUSES) }).partial().strict().parse(req.body);
    if (b.status && c.f.status === "released") return void res.status(409).json({ message: "La funcionalidad ya fue liberada" });
    if (b.status === "approved" && c.f.outOfContract) {
      const ok = await db.select().from(sdFeatureQuotes).where(and(eq(sdFeatureQuotes.featureId, c.f.id), eq(sdFeatureQuotes.status, "approved")));
      if (!ok.length) return void res.status(409).json({ message: "Una funcionalidad con costo adicional requiere cotización aprobada por el cliente" });
    }
    if (b.status && c.f.status === "uat") return void res.status(409).json({ message: "En UAT: el estado lo determina la respuesta del cliente" });
    const [row] = await db.update(sdFeatures).set({ ...b, updatedAt: new Date() }).where(eq(sdFeatures.id, c.f.id)).returning();
    await writeAudit({ actorUserId: req.actor.userId, action: "feature.update", entity: "feature", entityId: String(c.f.id), detail: b });
    res.json(row);
  }));

  app.post("/api/desk/features/:id/requests", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    const b = z.object({ ticketId: z.number().int().positive(), weight: z.number().int().min(1).max(100).default(1) }).parse(req.body);
    const [t] = await db.select({ a: sdTickets.accountId }).from(sdTickets).where(eq(sdTickets.id, b.ticketId));
    if (!t || !c.vis.includes(t.a)) return void res.status(404).json({ message: "No encontrado" });
    res.status(201).json(await addRequest(c.f.id, b.ticketId, b.weight));
  }));
  app.delete("/api/desk/features/:id/requests/:ticketId", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    const r = c.reqs.find((x) => x.ticketId === Number(req.params.ticketId));
    if (!r || !c.vis.includes(r.accountId)) return void res.status(404).json({ message: "No encontrado" });
    await db.delete(sdFeatureRequests).where(eq(sdFeatureRequests.id, r.id));
    res.json({ ok: true });
  }));

  app.post("/api/desk/features/:id/date", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    const b = z.object({ targetDate: z.string().nullable(), reason: z.string().max(500).default("") }).parse(req.body);
    await setTargetDate(c.f.id, b.targetDate, b.reason, req.actor.userId);
    res.json({ ok: true });
  }));

  // quotes
  app.post("/api/desk/features/:id/quotes", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    const b = quoteSchema.extend({ accountId: z.number().int().positive() }).parse(req.body);
    if (!c.vis.includes(b.accountId)) return void res.status(404).json({ message: "No encontrado" });
    const { accountId, ...q } = b;
    res.status(201).json(await createQuote(c.f.id, accountId, q, req.actor.userId));
  }));
  async function quoteOr404(req: Req, res: any) {
    const id = Number(req.params.id);
    const [q] = Number.isInteger(id) ? await db.select().from(sdFeatureQuotes).where(eq(sdFeatureQuotes.id, id)) : [];
    if (!q || !(await visibleAccountIds(req.actor)).includes(q.accountId)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return q;
  }
  app.patch("/api/desk/quotes/:id", ...auth, mgr, wrap(async (req, res) => {
    const q = await quoteOr404(req, res); if (!q) return;
    res.json(await updateQuote(q.id, quoteSchema.parse(req.body)));
  }));
  app.post("/api/desk/quotes/:id/send", ...auth, mgr, wrap(async (req, res) => {
    const q = await quoteOr404(req, res); if (!q) return;
    const r = await sendQuote(q.id);
    await writeAudit({ actorUserId: req.actor.userId, action: "quote.send", entity: "quote", entityId: String(q.id) });
    res.json(r);
  }));

  // UAT
  app.post("/api/desk/features/:id/uat", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    const b = z.object({ accountId: z.number().int().positive(), what: z.string().max(1000), how: z.string().max(3000).default("") }).parse(req.body);
    if (!c.vis.includes(b.accountId)) return void res.status(404).json({ message: "No encontrado" });
    res.status(201).json(await addUatItem(c.f.id, b.accountId, b.what, b.how));
  }));
  app.delete("/api/desk/uat/:id", ...auth, mgr, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [u] = Number.isInteger(id) ? await db.select().from(sdUatItems).where(eq(sdUatItems.id, id)) : [];
    if (!u || !(await visibleAccountIds(req.actor)).includes(u.accountId)) return void res.status(404).json({ message: "No encontrado" });
    if (u.status !== "pending") return void res.status(409).json({ message: "Solo se eliminan ítems pendientes" });
    await db.delete(sdUatItems).where(eq(sdUatItems.id, id));
    res.json({ ok: true });
  }));
  app.post("/api/desk/features/:id/uat/start", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    await startUat(c.f.id);
    res.json({ ok: true });
  }));
  app.post("/api/desk/features/:id/release", ...auth, mgr, wrap(async (req, res) => {
    const c = await featureOr404(req, res); if (!c) return;
    await manualRelease(c.f.id);
    await writeAudit({ actorUserId: req.actor.userId, action: "feature.release", entity: "feature", entityId: String(c.f.id) });
    res.json({ ok: true });
  }));

  app.get("/api/desk/accounts/:id/hours-bank", ...auth, workers, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !(await visibleAccountIds(req.actor)).includes(id)) return void res.status(404).json({ message: "No encontrado" });
    res.json(await bankSummary(id));
  }));
}
