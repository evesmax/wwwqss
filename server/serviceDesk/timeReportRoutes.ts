// Internal time-investment report: time and estimated cost by account / product / ticket type.
import type { Express, RequestHandler } from "express";
import { and, eq, inArray, isNotNull, isNull, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { sdAccounts, sdProducts, sdSettings, sdTickets, sdTimeEntries, clientes } from "@shared/schema";
import { visibleAccountIds } from "./access";
import { writeAudit } from "./audit";
import { requireRole, wrap, type Req } from "./httpUtil";
import { buildTimeReport, DEFAULT_RATE, type TimeRow } from "./timeReportRules";
import { TICKET_TYPES } from "./ticketRules";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rateSchema = z.object({ perHour: z.number().min(0).max(1e6), currency: z.string().trim().min(3).max(3).toUpperCase() });
export async function getTimeRate() {
  const [row] = await db.select().from(sdSettings).where(eq(sdSettings.key, "time_rate"));
  const p = rateSchema.safeParse(row?.value);
  return p.success ? p.data : DEFAULT_RATE;
}

export function registerTimeReportRoutes(app: Express, auth: RequestHandler[]) {
  const mgr = requireRole("owner", "support_manager");
  app.get("/api/desk/settings/time-rate", ...auth, mgr, wrap(async (_req, res) => { res.json(await getTimeRate()); }));
  app.put("/api/desk/settings/time-rate", ...auth, requireRole("owner"), wrap(async (req, res) => {
    const v = rateSchema.parse(req.body);
    await db.insert(sdSettings).values({ key: "time_rate", value: v, updatedBy: (req as Req).actor.userId })
      .onConflictDoUpdate({ target: sdSettings.key, set: { value: v, updatedAt: new Date(), updatedBy: (req as Req).actor.userId } });
    await writeAudit({ actorUserId: (req as Req).actor.userId, action: "time_rate.updated", entity: "settings", entityId: "time_rate", detail: v });
    res.json(v);
  }));

  const q = z.object({
    from: date.optional(), to: date.optional(),
    accountId: z.coerce.number().int().positive().optional(), productId: z.coerce.number().int().positive().optional(),
    type: z.enum(TICKET_TYPES).optional(), kind: z.enum(["all", "human", "agent"]).default("all"),
  });
  app.get("/api/desk/time-report", ...auth, mgr, wrap(async (req, res) => {
    const p = q.parse(req.query);
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
    const to = p.to ?? today;
    const from = p.from ?? new Date(Date.parse(to) - 29 * 86_400_000).toISOString().slice(0, 10);
    if (from > to) return void res.status(400).json({ message: "El rango de fechas es inválido" });
    const rate = await getTimeRate();
    let ids = await visibleAccountIds((req as Req).actor);
    if (p.accountId) ids = ids.filter((i) => i === p.accountId);
    const empty = { range: { from, to }, rate, ...buildTimeReport([], { accounts: new Map(), products: new Map() }, rate.perHour) };
    if (!ids.length) return void res.json(empty);
    const conds = [inArray(sdTickets.accountId, ids), gte(sdTimeEntries.workDate, from), lte(sdTimeEntries.workDate, to)];
    if (p.productId) conds.push(eq(sdTickets.productId, p.productId));
    if (p.type) conds.push(eq(sdTickets.type, p.type));
    if (p.kind === "agent") conds.push(isNotNull(sdTimeEntries.agentKeyId));
    if (p.kind === "human") conds.push(isNull(sdTimeEntries.agentKeyId));
    const rows: TimeRow[] = await db.select({
      minutes: sdTimeEntries.minutes, agentKeyId: sdTimeEntries.agentKeyId, workDate: sdTimeEntries.workDate,
      ticketId: sdTickets.id, key: sdTickets.key, title: sdTickets.title, type: sdTickets.type, accountId: sdTickets.accountId, productId: sdTickets.productId,
    }).from(sdTimeEntries).innerJoin(sdTickets, eq(sdTickets.id, sdTimeEntries.ticketId)).where(and(...conds));
    const [accs, prods] = await Promise.all([
      db.select({ id: sdAccounts.id, n: clientes.nombreNegocio }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(inArray(sdAccounts.id, ids)),
      db.select({ id: sdProducts.id, n: sdProducts.name }).from(sdProducts),
    ]);
    res.json({ range: { from, to }, rate, ...buildTimeReport(rows, { accounts: new Map(accs.map((a) => [a.id, a.n])), products: new Map(prods.map((x) => [x.id, x.n])) }, rate.perHour) });
  }));
}
