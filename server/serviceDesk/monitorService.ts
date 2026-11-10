import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sdMonitors, sdProbeResults, sdInstances, sdPlatformIncidents, sdPlatformIncidentUpdates, sdMaintenance, sdContacts, sdProducts,
} from "@shared/schema";
import { classifyMinute, computeAvailability, dailyStatus, type Probe } from "./availability";
import { autoIncidentAction } from "./monitorRules";
import { sendEmail } from "./emailService";
import { escapeHtml } from "./emailTemplates";

const MIN = 60_000;
export const TZ = "America/Mexico_City";

async function probeOne(url: string, expected: number) {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "manual", headers: { "user-agent": "QSS-Monitor/1.0" } });
    return { ok: r.status === expected, status: r.status, latencyMs: Date.now() - started };
  } catch { return { ok: false, status: null as number | null, latencyMs: Date.now() - started }; }
  finally { clearTimeout(timer); }
}

export async function runProbes(location: string, now = new Date()) {
  const mons = await db.select().from(sdMonitors).where(eq(sdMonitors.active, true));
  const minute = new Date(Math.floor(now.getTime() / MIN) * MIN);
  await Promise.all(mons.map(async (m) => {
    const r = await probeOne(m.url, m.expectedStatus);
    await db.insert(sdProbeResults).values({ monitorId: m.id, minute, location, ok: r.ok, status: r.status, latencyMs: r.latencyMs })
      .onConflictDoUpdate({ target: [sdProbeResults.monitorId, sdProbeResults.minute, sdProbeResults.location], set: { ok: r.ok, status: r.status, latencyMs: r.latencyMs } });
  }));
  if (Math.random() < 0.02) await db.delete(sdProbeResults).where(lt(sdProbeResults.minute, new Date(now.getTime() - 120 * 86_400_000))).catch(() => {});
  await evaluateAutoIncidents(now).catch((e) => console.error("auto incident error:", e.message));
  return { monitors: mons.length, minute: minute.toISOString() };
}

/** Last N closed minutes (excluding the current one) classified per monitor. */
async function lastClasses(monitorId: number, now: Date, n: number) {
  const cur = Math.floor(now.getTime() / MIN) * MIN;
  const rows = await db.select().from(sdProbeResults).where(and(eq(sdProbeResults.monitorId, monitorId), gte(sdProbeResults.minute, new Date(cur - n * MIN)), lt(sdProbeResults.minute, new Date(cur))));
  const by = new Map<number, { location: string; ok: boolean }[]>();
  for (const r of rows) by.set(+r.minute, [...(by.get(+r.minute) ?? []), { location: r.location, ok: r.ok }]);
  return Array.from({ length: n }, (_, i) => classifyMinute(by.get(cur - (n - i) * MIN) ?? []));
}

export async function evaluateAutoIncidents(now = new Date()) {
  const rows = await db.select({ id: sdMonitors.id, name: sdMonitors.name, productId: sdInstances.productId }).from(sdMonitors)
    .innerJoin(sdInstances, eq(sdInstances.id, sdMonitors.instanceId)).where(eq(sdMonitors.active, true));
  for (const m of rows) {
    const classes = await lastClasses(m.id, now, 5);
    const [open] = await db.select().from(sdPlatformIncidents).where(and(eq(sdPlatformIncidents.productId, m.productId), eq(sdPlatformIncidents.auto, true), isNull(sdPlatformIncidents.resolvedAt)));
    const act = autoIncidentAction(classes, !!open);
    if (act === "open") {
      const [i] = await db.insert(sdPlatformIncidents).values({ productId: m.productId, title: `Posible interrupción: ${m.name}`, status: "investigating", impact: "major", isPublic: false, auto: true }).returning();
      await db.insert(sdPlatformIncidentUpdates).values({ incidentId: i.id, status: "investigating", body: "Detectado automáticamente: falló el monitor desde 2 ubicaciones por 3 minutos." });
    } else if (act === "resolve" && open) {
      await db.update(sdPlatformIncidents).set({ status: "resolved", resolvedAt: now }).where(eq(sdPlatformIncidents.id, open.id));
      await db.insert(sdPlatformIncidentUpdates).values({ incidentId: open.id, status: "resolved", body: "El monitor se recuperó (5 minutos consecutivos sin fallas)." });
    }
  }
}

export async function loadProbes(monitorIds: number[], fromMs: number, toMs: number): Promise<Probe[]> {
  if (!monitorIds.length) return [];
  const rows = await db.select({ minute: sdProbeResults.minute, location: sdProbeResults.location, ok: sdProbeResults.ok })
    .from(sdProbeResults).where(and(inArray(sdProbeResults.monitorId, monitorIds), gte(sdProbeResults.minute, new Date(fromMs)), lt(sdProbeResults.minute, new Date(toMs))));
  return rows.map((r) => ({ minute: +r.minute, location: r.location, ok: r.ok }));
}

export async function maintenanceWindows(productId: number, fromMs: number, toMs: number, onlyAnnounced = true) {
  const rows = await db.select().from(sdMaintenance).where(and(eq(sdMaintenance.productId, productId), lt(sdMaintenance.startsAt, new Date(toMs)), gte(sdMaintenance.endsAt, new Date(fromMs))));
  return rows.filter((r) => !onlyAnnounced || r.noticeOk).map((r) => ({ startMs: +r.startsAt, endMs: +r.endsAt }));
}

export async function monthlyAvailability(year: number, month: number, now = new Date(), instanceIds?: number[]) {
  const { monthRange } = await import("./availability");
  const { fromMs, toMs } = monthRange(year, month, TZ);
  const mons = await db.select({ id: sdMonitors.id, name: sdMonitors.name, instanceId: sdMonitors.instanceId, productId: sdInstances.productId, instance: sdInstances.name })
    .from(sdMonitors).innerJoin(sdInstances, eq(sdInstances.id, sdMonitors.instanceId));
  const out = [];
  if (instanceIds) for (let k = mons.length - 1; k >= 0; k--) if (!instanceIds.includes(mons[k].instanceId)) mons.splice(k, 1);
  for (const m of mons) {
    const probes = await loadProbes([m.id], fromMs, toMs);
    const maint = await maintenanceWindows(m.productId, fromMs, toMs);
    out.push({ monitorId: m.id, name: m.name, instanceId: m.instanceId, instance: m.instance, productId: m.productId, ...computeAvailability({ fromMs, toMs, nowMs: now.getTime(), probes, maintenance: maint }) });
  }
  return { year, month, tz: TZ, monitors: out };
}

// ---- public status (RF-AV-05) ----
let statusCache: { at: number; data: any } | null = null;
export async function publicStatus(now = new Date()) {
  if (statusCache && Date.now() - statusCache.at < 60_000) return statusCache.data;
  const mons = await db.select({ id: sdMonitors.id, name: sdMonitors.name, productId: sdInstances.productId }).from(sdMonitors)
    .innerJoin(sdInstances, eq(sdInstances.id, sdMonitors.instanceId)).where(and(eq(sdMonitors.active, true), eq(sdMonitors.isPublic, true)));
  const productIds = Array.from(new Set(mons.map((m) => m.productId)));
  if (!productIds.length) { const d = { generatedAt: now.toISOString(), products: [] }; statusCache = { at: Date.now(), data: d }; return d; }
  const prods = await db.select().from(sdProducts).where(inArray(sdProducts.id, productIds));
  const daily = (await db.execute(sql`
    WITH per_min AS (SELECT monitor_id, minute, count(*) FILTER (WHERE NOT ok) AS fails FROM sd_probe_results
      WHERE minute > now() - interval '91 days' AND monitor_id = ANY(${sql.raw(`ARRAY[${mons.map((m) => m.id).join(",")}]::int[]`)}) GROUP BY 1, 2)
    SELECT monitor_id, (minute AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date::text AS day, count(*) FILTER (WHERE fails >= 2)::int AS down, count(*)::int AS minutes FROM per_min GROUP BY 1, 2`)).rows as any[];
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const incidents = await db.select().from(sdPlatformIncidents).where(and(inArray(sdPlatformIncidents.productId, productIds), eq(sdPlatformIncidents.isPublic, true), gte(sdPlatformIncidents.startedAt, since))).orderBy(desc(sdPlatformIncidents.startedAt));
  const ups = incidents.length ? await db.select().from(sdPlatformIncidentUpdates).where(inArray(sdPlatformIncidentUpdates.incidentId, incidents.map((i) => i.id))).orderBy(asc(sdPlatformIncidentUpdates.id)) : [];
  const maint = await db.select().from(sdMaintenance).where(and(inArray(sdMaintenance.productId, productIds), gte(sdMaintenance.endsAt, now))).orderBy(asc(sdMaintenance.startsAt));
  const days: string[] = [];
  for (let i = 89; i >= 0; i--) days.push(new Date(now.getTime() - i * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ }));
  const data = {
    generatedAt: now.toISOString(),
    products: prods.map((p) => {
      const open = incidents.filter((i) => i.productId === p.id && i.status !== "resolved");
      return {
        name: p.name, status: open.some((i) => i.impact === "critical") ? "outage" : open.length ? "degraded" : "operational",
        components: mons.filter((m) => m.productId === p.id).map((m) => {
          const byDay = new Map(daily.filter((d) => d.monitor_id === m.id).map((d) => [d.day, d]));
          let down = 0, tot = 0;
          const series = days.map((day) => { const d = byDay.get(day); const mins = d?.minutes ?? 0, dn = d?.down ?? 0; down += dn; tot += mins; return { day, status: dailyStatus({ elapsedMinutes: 1440, downMinutes: dn, noDataMinutes: 1440 - mins }) }; });
          return { name: m.name, uptime90: tot ? Math.round((100 - (down / tot) * 100) * 100) / 100 : null, days: series };
        }),
        incidents: incidents.filter((i) => i.productId === p.id).map((i) => ({ id: i.id, title: i.title, status: i.status, impact: i.impact, startedAt: i.startedAt, resolvedAt: i.resolvedAt,
          updates: ups.filter((u) => u.incidentId === i.id).map((u) => ({ at: u.at, status: u.status, body: u.body })) })),
        maintenance: maint.filter((m) => m.productId === p.id).map((m) => ({ title: m.title, startsAt: m.startsAt, endsAt: m.endsAt })),
      };
    }),
  };
  statusCache = { at: Date.now(), data };
  return data;
}
export const clearStatusCache = () => { statusCache = null; };

export async function notifyMaintenance(m: { id: number; productId: number; title: string; startsAt: Date; endsAt: Date }) {
  const insts = await db.select({ a: sdInstances.accountId }).from(sdInstances).where(eq(sdInstances.productId, m.productId));
  const accounts = Array.from(new Set(insts.map((i) => i.a)));
  if (!accounts.length) return 0;
  const admins = await db.select({ email: sdContacts.email }).from(sdContacts).where(and(inArray(sdContacts.accountId, accounts), eq(sdContacts.role, "account_admin")));
  const fmt = (d: Date) => d.toLocaleString("es-MX", { timeZone: TZ, dateStyle: "full", timeStyle: "short" });
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Mantenimiento programado</h2><p><b>${escapeHtml(m.title)}</b></p><p>Inicia: ${escapeHtml(fmt(m.startsAt))}<br>Termina: ${escapeHtml(fmt(m.endsAt))} (hora de Ciudad de México)</p><p style="font-size:12px;color:#888">QSoftware Solutions · Soporte</p></div>`;
  for (const e of Array.from(new Set(admins.map((a) => a.email)))) await sendEmail({ to: e, subject: `Mantenimiento programado: ${m.title}`, html });
  return admins.length;
}
