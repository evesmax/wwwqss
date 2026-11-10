import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sdAccounts, sdTickets, sdTicketEvents, sdSlaInstances, sdTimeEntries, sdContracts, sdContacts, sdInstances, sdPlatformIncidents, sdMaintenance, sdReports, clientes, sdSettings,
} from "@shared/schema";
import { buildReport, periodLabel, renderReportHtml, type Report, type ReportTicket } from "./reportRules";
import { monthRange } from "./availability";
import { monthlyAvailability, TZ } from "./monitorService";
import { sendEmail } from "./emailService";

const base = () => (process.env.PUBLIC_BASE_URL || "https://qsoftwaresolutions.com").replace(/\/+$/, "");
export const reportHtml = (r: Report) => renderReportHtml(r, { logoUrl: `${base()}/qss-logo.png`, portalUrl: `${base()}/portal/reports` });

export async function collectReport(accountId: number, year: number, month: number, now = new Date()): Promise<Report> {
  const { fromMs, toMs } = monthRange(year, month, TZ);
  const [acc] = await db.select({ id: sdAccounts.id, name: clientes.nombreNegocio }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(eq(sdAccounts.id, accountId));
  if (!acc) throw new Error("Cuenta no encontrada");
  const rows = await db.select().from(sdTickets).where(and(eq(sdTickets.accountId, accountId), lt(sdTickets.createdAt, new Date(toMs))));
  const ids = rows.map((t) => t.id);
  const snaps = ids.length ? await db.select().from(sdSlaInstances).where(inArray(sdSlaInstances.ticketId, ids)) : [];
  const reopened = ids.length ? await db.select({ id: sdTicketEvents.ticketId }).from(sdTicketEvents)
    .where(and(inArray(sdTicketEvents.ticketId, ids), eq(sdTicketEvents.kind, "status_changed"), gte(sdTicketEvents.at, new Date(fromMs)), lt(sdTicketEvents.at, new Date(toMs)),
      sql`${sdTicketEvents.detail}->>'to' = 'in_progress' AND ${sdTicketEvents.detail}->>'from' IN ('resolved','closed')`)) : [];
  const reopenedSet = new Set(reopened.map((r) => r.id));
  const tickets: ReportTicket[] = rows.map((t) => {
    const sla: ReportTicket["sla"] = {};
    for (const s of snaps.filter((x) => x.ticketId === t.id)) if (s.metric === "first_response" || s.metric === "resolution") sla[s.metric] = { state: s.state, elapsedMs: Number(s.elapsedMs), stoppedAt: s.stoppedAt };
    return { id: t.id, key: t.key, title: t.title, type: t.type, severity: t.severity, status: t.status, createdAt: t.createdAt, resolvedAt: t.resolvedAt,
      slaApplicable: t.slaApplicable, exclusionReason: t.slaExclusionReason, reopenedInPeriod: reopenedSet.has(t.id), rcaCause: (t.rca as any)?.cause ?? null, sla };
  });
  const insts = await db.select().from(sdInstances).where(eq(sdInstances.accountId, accountId));
  const av = insts.length ? await monthlyAvailability(year, month, now, insts.map((i) => i.id)) : { monitors: [] };
  const productIds = Array.from(new Set(insts.map((i) => i.productId)));
  const incidents = productIds.length ? await db.select().from(sdPlatformIncidents).where(and(inArray(sdPlatformIncidents.productId, productIds), eq(sdPlatformIncidents.isPublic, true), gte(sdPlatformIncidents.startedAt, new Date(fromMs)), lt(sdPlatformIncidents.startedAt, new Date(toMs)))) : [];
  const upcoming = productIds.length ? await db.select().from(sdMaintenance).where(and(inArray(sdMaintenance.productId, productIds), gte(sdMaintenance.endsAt, new Date(toMs)))) : [];
  const firstDay = new Date(fromMs + 12 * 3600_000).toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 8) + "01";
  const lastDay = new Date(toMs - 12 * 3600_000).toLocaleDateString("en-CA", { timeZone: TZ });
  const te = ids.length ? await db.select({ m: sdTimeEntries.minutes }).from(sdTimeEntries).where(and(inArray(sdTimeEntries.ticketId, ids), eq(sdTimeEntries.billable, true), sql`${sdTimeEntries.workDate} >= ${firstDay} AND ${sdTimeEntries.workDate} <= ${lastDay}`)) : [];
  const contracts = await db.select().from(sdContracts).where(and(eq(sdContracts.accountId, accountId), eq(sdContracts.active, true)));
  const banks = contracts.map((c) => c.hoursBank).filter((x): x is string => x != null).map(Number);
  return buildReport({
    account: acc.name, period: { year, month, fromMs, toMs }, generatedAt: now, tickets,
    availability: av.monitors.map((m: any) => ({ name: m.name, instance: m.instance, pct: m.pct, downMinutes: m.downMinutes, maintenanceMinutes: m.maintenanceMinutes, coverage: m.coverage })),
    incidents: incidents.map((i) => ({ title: i.title, startedAt: i.startedAt, resolvedAt: i.resolvedAt, impact: i.impact, rca: (i.rca as any) ?? null })),
    maintenanceUpcoming: upcoming.map((m) => ({ title: m.title, startsAt: m.startsAt, endsAt: m.endsAt })),
    hoursMinutes: te.reduce((s, x) => s + x.m, 0), hoursBankMinutes: banks.length ? Math.round(banks.reduce((s, x) => s + x, 0) * 60) : null,
  });
}

export class ReportError extends Error { constructor(m: string, public status = 400) { super(m); } }

export async function generateReport(accountId: number, year: number, month: number, userId: number | null, note = "", now = new Date()) {
  const { toMs } = monthRange(year, month, TZ);
  if (toMs > now.getTime()) throw new ReportError("El periodo aún no termina: genera el informe después del cierre del mes");
  const existing = await db.select().from(sdReports).where(and(eq(sdReports.accountId, accountId), eq(sdReports.periodYear, year), eq(sdReports.periodMonth, month))).orderBy(desc(sdReports.version));
  const last = existing[0];
  if (last && last.status === "draft") throw new ReportError("Ya existe un borrador de este periodo: apruébalo o elimínalo antes de generar otro", 409);
  if (last && !note.trim()) throw new ReportError("Para emitir una nueva versión indica la nota de corrección");
  const data = await collectReport(accountId, year, month, now);
  const [row] = await db.insert(sdReports).values({ accountId, periodYear: year, periodMonth: month, version: (last?.version ?? 0) + 1, status: "draft", data: data as any, note: note.trim(), createdBy: userId }).returning();
  return row;
}

export async function recipientsFor(accountId: number): Promise<string[]> {
  const cs = await db.select().from(sdContracts).where(and(eq(sdContracts.accountId, accountId), eq(sdContracts.active, true)));
  const fromContracts = cs.flatMap((c) => (Array.isArray(c.reportRecipients) ? (c.reportRecipients as unknown[]).filter((x): x is string => typeof x === "string") : []));
  const admins = await db.select({ e: sdContacts.email }).from(sdContacts).where(and(eq(sdContacts.accountId, accountId), eq(sdContacts.role, "account_admin")));
  return Array.from(new Set([...fromContracts, ...admins.map((a) => a.e)].map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
}

export async function sendReport(id: number, userId: number | null) {
  const [r] = await db.select().from(sdReports).where(eq(sdReports.id, id));
  if (!r) throw new ReportError("No encontrado", 404);
  if (r.status === "draft") throw new ReportError("El informe debe aprobarse antes de enviarse", 409);
  const to = await recipientsFor(r.accountId);
  if (!to.length) throw new ReportError("La cuenta no tiene destinatarios (administradores de cuenta o lista del contrato)");
  const data = r.data as unknown as Report;
  const html = reportHtml(data);
  const subject = `Informe mensual de servicio · ${data.account} · ${periodLabel(r.periodYear, r.periodMonth)}${r.version > 1 ? ` (v${r.version})` : ""}`;
  const results: { to: string; status: string; error?: string; at: string }[] = [];
  for (const email of to) { const s = await sendEmail({ to: email, subject, html }); results.push({ to: email, status: s.status, error: s.error, at: new Date().toISOString() }); }
  const sent = results.some((x) => x.status === "sent");
  await db.update(sdReports).set({ status: sent || r.status === "sent" ? "sent" : r.status, sentAt: r.sentAt ?? (sent ? new Date() : null), sendLog: [...((r.sendLog as any[]) ?? []), { by: userId, results }] as any }).where(eq(sdReports.id, id));
  return { recipients: to.length, sent: results.filter((x) => x.status === "sent").length, results };
}

/** Cron: on/after the configured day (default 3, Mexico City) create a draft for last month for every active account that has none. Idempotent. */
export async function runMonthlyReports(now = new Date()) {
  const [cfg] = await db.select().from(sdSettings).where(eq(sdSettings.key, "report.day"));
  const day = Math.min(28, Math.max(1, Number(cfg?.value ?? 3)));
  const local = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  if (local.getDate() < day) return { created: 0, skipped: "before report day" };
  const prev = new Date(local.getFullYear(), local.getMonth() - 1, 1);
  const [year, month] = [prev.getFullYear(), prev.getMonth() + 1];
  const accounts = await db.select({ id: sdAccounts.id }).from(sdAccounts).where(eq(sdAccounts.active, true));
  let created = 0;
  for (const a of accounts) {
    const has = await db.select({ id: sdReports.id }).from(sdReports).where(and(eq(sdReports.accountId, a.id), eq(sdReports.periodYear, year), eq(sdReports.periodMonth, month))).limit(1);
    if (has.length) continue;
    try { await generateReport(a.id, year, month, null, "", now); created++; } catch (e: any) { console.error("monthly report error:", a.id, e.message); }
  }
  return { created, year, month };
}
