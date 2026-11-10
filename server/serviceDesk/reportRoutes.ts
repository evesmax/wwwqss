import type { Express, RequestHandler } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdReports } from "@shared/schema";
import { requireRole, accountOr404, type Req } from "./httpUtil";
import { visibleAccountIds } from "./access";
import { writeAudit } from "./audit";
import { generateReport, recipientsFor, reportHtml, ReportError, runMonthlyReports, sendReport } from "./reportService";
import { verifyCronToken } from "./slaService";

export function registerReportRoutes(app: Express, auth: RequestHandler[]) {
  const mgr = requireRole("owner", "support_manager");
  const workers = requireRole("owner", "support_manager", "agent_l2", "agent_l1");
  const run = (fn: (req: Req, res: any) => Promise<unknown>): RequestHandler => async (req, res, next) => {
    try { await fn(req as Req, res); } catch (e) {
      if (e instanceof ReportError) return void res.status(e.status).json({ message: e.message });
      if (e instanceof z.ZodError) return void res.status(400).json({ message: "Datos inválidos", issues: e.issues });
      console.error("report route error:", e); next(e);
    }
  };

  async function reportOr404(req: Req, res: any) {
    const id = Number(req.params.id);
    const [r] = Number.isInteger(id) ? await db.select().from(sdReports).where(eq(sdReports.id, id)) : [];
    if (!r || !(await visibleAccountIds(req.actor)).includes(r.accountId)) { res.status(404).json({ message: "No encontrado" }); return null; }
    return r;
  }
  const meta = (r: typeof sdReports.$inferSelect) => ({ id: r.id, accountId: r.accountId, year: r.periodYear, month: r.periodMonth, version: r.version, status: r.status, note: r.note, createdAt: r.createdAt, approvedAt: r.approvedAt, sentAt: r.sentAt, sendLog: r.sendLog });

  app.get("/api/desk/reports", ...auth, workers, run(async (req, res) => {
    const ids = await visibleAccountIds(req.actor);
    const accountId = req.query.accountId ? Number(req.query.accountId) : null;
    if (accountId && !ids.includes(accountId)) return void res.status(404).json({ message: "No encontrado" });
    const rows = ids.length ? await db.select().from(sdReports).where(accountId ? eq(sdReports.accountId, accountId) : inArray(sdReports.accountId, ids)).orderBy(desc(sdReports.periodYear), desc(sdReports.periodMonth), desc(sdReports.version)).limit(200) : [];
    res.json(rows.map((r) => ({ ...meta(r), summary: (r.data as any).summary, account: (r.data as any).account })));
  }));
  app.get("/api/desk/reports/:id", ...auth, workers, run(async (req, res) => {
    const r = await reportOr404(req, res); if (!r) return;
    res.json({ ...meta(r), html: reportHtml(r.data as any), recipients: await recipientsFor(r.accountId), notes: (r.data as any).notes });
  }));
  app.post("/api/desk/reports", ...auth, mgr, run(async (req, res) => {
    const b = z.object({ accountId: z.number().int().positive(), year: z.number().int().min(2024).max(2100), month: z.number().int().min(1).max(12), note: z.string().trim().max(1000).default("") }).parse(req.body);
    if (!(await accountOr404(req.actor, b.accountId, res))) return;
    const r = await generateReport(b.accountId, b.year, b.month, req.actor.userId, b.note);
    await writeAudit({ actorUserId: req.actor.userId, action: "report.generate", entity: "report", entityId: String(r.id), detail: { ...b, version: r.version } });
    res.status(201).json(meta(r));
  }));
  app.post("/api/desk/reports/:id/approve", ...auth, mgr, run(async (req, res) => {
    const r = await reportOr404(req, res); if (!r) return;
    if (r.status !== "draft") return void res.status(409).json({ message: "Solo los borradores se aprueban" });
    await db.update(sdReports).set({ status: "approved", approvedBy: req.actor.userId, approvedAt: new Date() }).where(eq(sdReports.id, r.id));
    await writeAudit({ actorUserId: req.actor.userId, action: "report.approve", entity: "report", entityId: String(r.id) });
    res.json({ ok: true });
  }));
  app.post("/api/desk/reports/:id/send", ...auth, mgr, run(async (req, res) => {
    const r = await reportOr404(req, res); if (!r) return;
    const out = await sendReport(r.id, req.actor.userId);
    await writeAudit({ actorUserId: req.actor.userId, action: "report.send", entity: "report", entityId: String(r.id), detail: { recipients: out.recipients, sent: out.sent } });
    res.json(out);
  }));
  app.delete("/api/desk/reports/:id", ...auth, mgr, run(async (req, res) => {
    const r = await reportOr404(req, res); if (!r) return;
    if (r.status !== "draft") return void res.status(409).json({ message: "Solo se pueden eliminar borradores (los informes aprobados son inmutables)" });
    await db.delete(sdReports).where(eq(sdReports.id, r.id));
    res.json({ ok: true });
  }));

  // cron (Cloud Scheduler): drafts for last month, idempotent
  app.post("/api/internal/reports/run", async (req, res) => {
    try {
      if (!(await verifyCronToken(String(req.headers["x-tick-token"] ?? "")))) return res.status(401).json({ message: "No autorizado" });
      res.json(await runMonthlyReports());
    } catch (e: any) { console.error("reports cron error:", e.message); res.status(500).json({ message: "Error" }); }
  });
}
