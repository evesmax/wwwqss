import crypto from "crypto";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sdTickets, sdTicketEvents, sdContracts, sdSlaPolicies, sdSlaInstances, sdSlaAlerts, sdSlaChanges, sdHolidays,
  sdSettings, sdRoleAssignments, users, sdAccounts,
} from "@shared/schema";
import { computeTicketSla, selectPolicy, type SlaEvent, type Policy, type PolicyFilters, type MetricResult } from "./slaEngine";
import { defaultBusinessCalendar, mxOfficialHolidays, type Calendar } from "./slaCalendar";
import { DEFAULT_ESCALATION, alertKey, targetsFor, thresholdsCrossed, type Escalation } from "./slaAlerts";
import { accountProductMap, canAccessAccount, resolveScope } from "./access";
import { sendEmail } from "./emailService";
import { slaAlertEmail } from "./emailTemplates";
const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL || "https://qsoftwaresolutions.com").replace(/\/+$/, "");

export const EXCLUSION_REASONS = ["third_party_declared", "customer_no_info", "mistyped", "force_majeure"] as const;
export const TERMINAL_STATUSES = ["resolved", "closed", "duplicate", "cancelled", "rejected"];

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [r] = await db.select().from(sdSettings).where(eq(sdSettings.key, key));
  return r ? (r.value as T) : fallback;
}
export async function setSetting(key: string, value: unknown, userId: number | null) {
  await db.insert(sdSettings).values({ key, value: value as any, updatedBy: userId })
    .onConflictDoUpdate({ target: sdSettings.key, set: { value: value as any, updatedBy: userId, updatedAt: new Date() } });
}
export const getCalendarSettings = () => getSetting("sla.calendar", (({ tz, days, start, end }) => ({ tz, days, start, end }))(defaultBusinessCalendar()));
export const getEscalation = () => getSetting<Escalation>("sla.escalation", DEFAULT_ESCALATION);
export const getCalcVersion = () => getSetting<number>("sla.version", 1);

async function holidaysFor(accountId: number, fromYear: number, toYear: number): Promise<string[]> {
  const rows = await db.select({ date: sdHolidays.date, accountId: sdHolidays.accountId }).from(sdHolidays);
  const out = new Set<string>(rows.filter((r) => r.accountId == null || r.accountId === accountId).map((r) => r.date));
  for (let y = fromYear; y <= toYear; y++) for (const d of mxOfficialHolidays(y)) out.add(d);
  return Array.from(out);
}
export async function buildCalendar(kind: string, accountId: number, fromYear: number, toYear: number): Promise<Calendar> {
  if (kind === "24x7") return { kind: "24x7" };
  const c = await getCalendarSettings();
  return { kind: "business", ...c, holidays: await holidaysFor(accountId, fromYear, toYear) };
}

type PolicyRow = typeof sdSlaPolicies.$inferSelect;
const toPolicy = (p: PolicyRow): Policy & { filters: PolicyFilters; calendarKind: string; version: number } => ({
  id: p.id, name: p.name, firstResponseMin: p.firstResponseMin, updateMin: p.updateMin, resolutionMin: p.resolutionMin,
  filters: (p.filters ?? {}) as PolicyFilters, calendarKind: p.calendarKind, version: p.version,
});

export type TicketSlaView = { policy: { id: number; name: string } | null; applicable: boolean; excludedReason: string | null; metrics: MetricResult[] };

/** Pure-ish: computes the SLA for one ticket from the DB without persisting. */
// During parallel/hypercare the policy is configurable: "best_effort" (default) keeps tickets out of SLA compliance; "own" measures them.
async function parallelBestEffort() { const [r] = await db.select().from(sdSettings).where(eq(sdSettings.key, "project.parallelSla")); return (r?.value != null ? String(r.value) : "best_effort") !== "own"; }

import { lifecycleAt, type LifecycleEntry } from "./projectItemRules";

export async function computeForTicket(ticketId: number, now = new Date()): Promise<TicketSlaView | null> {
  const [t] = await db.select().from(sdTickets).where(eq(sdTickets.id, ticketId));
  if (!t) return null;
  const evs = await db.select().from(sdTicketEvents).where(eq(sdTicketEvents.ticketId, ticketId)).orderBy(asc(sdTicketEvents.at), asc(sdTicketEvents.id));
  const events: SlaEvent[] = evs.map((e) => ({ at: e.at, kind: e.kind, actorType: e.actorType, detail: (e.detail ?? {}) as Record<string, unknown> }));
  const contracts = t.productId
    ? await db.select().from(sdContracts).where(and(eq(sdContracts.accountId, t.accountId), eq(sdContracts.productId, t.productId), eq(sdContracts.active, true)))
    : await db.select().from(sdContracts).where(and(eq(sdContracts.accountId, t.accountId), eq(sdContracts.active, true))).orderBy(asc(sdContracts.id)).limit(1);
  const contract = contracts[0];
  const policies = (await db.select().from(sdSlaPolicies).where(eq(sdSlaPolicies.active, true)).orderBy(asc(sdSlaPolicies.position), asc(sdSlaPolicies.id))).map(toPolicy);
  const pol = selectPolicy(policies, { type: t.type, severity: t.severity, accountId: t.accountId, productId: t.productId, plan: contract?.plan ?? null });
  if (!pol) return { policy: null, applicable: false, excludedReason: null, metrics: [] };
  const cal = await buildCalendar(pol.calendarKind, t.accountId, t.createdAt.getFullYear() - 1, now.getFullYear() + 1);
  const lc = contract ? lifecycleAt((contract.lifecycleLog as LifecycleEntry[]) ?? [], contract.lifecycle, t.createdAt) : "operation";
  const lifecycleOff = lc === "discovery" || lc === "implementation" || (lc === "parallel" && (await parallelBestEffort()));
  const beforeActive = (!!contract?.slaActiveFrom && t.createdAt < contract.slaActiveFrom) || lifecycleOff;
  const r = computeTicketSla({
    ticket: { type: t.type, severity: t.severity, slaApplicable: t.slaApplicable && !beforeActive, createdAt: t.createdAt },
    events, policy: pol, calendar: cal, now,
  });
  return { policy: { id: pol.id, name: pol.name }, applicable: r.applicable, excludedReason: t.slaExclusionReason ?? (lifecycleOff ? `lifecycle_${lc}` : beforeActive ? "before_sla_start" : null), metrics: r.metrics };
}

export async function refreshTicketSla(ticketId: number, now = new Date(), opts: { alert?: boolean } = {}) {
  const view = await computeForTicket(ticketId, now);
  if (!view) return null;
  const [ver, pol] = [await getCalcVersion(), view.policy];
  const keys = view.metrics.map((m) => m.key);
  if (!keys.length) await db.delete(sdSlaInstances).where(eq(sdSlaInstances.ticketId, ticketId));
  else await db.delete(sdSlaInstances).where(and(eq(sdSlaInstances.ticketId, ticketId), notInArray(sdSlaInstances.metric, keys)));
  for (const m of view.metrics) {
    const row = {
      ticketId, metric: m.key, policyId: pol?.id ?? null, policyVersion: null, state: m.state, targetMs: String(m.targetMs), elapsedMs: String(m.elapsedMs),
      dueAt: m.dueAt, paused: m.paused, stoppedAt: m.stoppedAt, breaches: m.breaches, pauses: m.pauses.filter((p) => p.reason !== "resolved") as any,
      calcVersion: ver, computedAt: now,
    };
    await db.insert(sdSlaInstances).values(row).onConflictDoUpdate({ target: [sdSlaInstances.ticketId, sdSlaInstances.metric], set: row });
  }
  if (opts.alert) await sendAlerts(ticketId, view);
  return view;
}
/** Fire-and-forget refresh used after ticket mutations. Never throws. */
export function refreshSoon(ticketId: number) {
  refreshTicketSla(ticketId).catch((e) => console.error("sla refresh error:", e.message));
}

export async function recipients(accountId: number, assigneeId: number | null, targets: string[]): Promise<string[]> {
  const out = new Set<string>();
  const us = await db.select({ id: users.id, email: users.email, active: users.active }).from(users);
  const byId = new Map(us.map((u) => [u.id, u]));
  if (targets.includes("assignee") && assigneeId && byId.get(assigneeId)?.email) out.add(byId.get(assigneeId)!.email);
  if (targets.includes("manager") || targets.includes("owner")) {
    const want = [targets.includes("manager") ? "support_manager" : "", targets.includes("owner") ? "owner" : ""].filter(Boolean);
    const rows = await db.select().from(sdRoleAssignments).where(inArray(sdRoleAssignments.role, want));
    const pm = await accountProductMap();
    const byUser = new Map<number, typeof rows>();
    for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    for (const [uid, rs] of Array.from(byUser.entries())) {
      const u = byId.get(uid);
      if (!u?.active || !u.email) continue;
      if (canAccessAccount({ userId: uid, roles: rs.map((r) => r.role), scope: resolveScope(rs) }, accountId, pm.get(accountId) ?? [])) out.add(u.email);
    }
  }
  return Array.from(out);
}

async function sendAlerts(ticketId: number, view: TicketSlaView) {
  const [t] = await db.select().from(sdTickets).where(eq(sdTickets.id, ticketId));
  if (!t || !view.applicable || TERMINAL_STATUSES.includes(t.status)) return;
  const esc = await getEscalation();
  for (const m of view.metrics) {
    if (m.stoppedAt || m.state === "excluded" || m.state === "cancelled") continue;
    const crossed = thresholdsCrossed(m.pctUsed, m.state === "breached");
    const fresh: number[] = [];
    const key = alertKey(m.key, m.startedAt);
    const sent = await db.select({ th: sdSlaAlerts.threshold }).from(sdSlaAlerts).where(and(eq(sdSlaAlerts.ticketId, ticketId), eq(sdSlaAlerts.metric, key)));
    const maxSent = Math.max(0, ...sent.map((r) => r.th));
    for (const th of crossed.filter((x) => x > maxSent)) {
      const ins = await db.insert(sdSlaAlerts).values({ ticketId, metric: key, threshold: th }).onConflictDoNothing().returning();
      if (ins.length) fresh.push(th);
    }
    if (!fresh.length) continue;
    const top = Math.max(...fresh);
    const targets = targetsFor(esc, t.severity, top);
    const to = await recipients(t.accountId, t.assigneeUserId, targets);
    if (!to.length) continue;
    const mail = slaAlertEmail({ key: t.key, title: t.title, severity: t.severity }, m.key, top, `${publicBaseUrl()}/admin/soporte/tickets/${t.id}`);
    await sendEmail({ to, ...mail });
  }
}

/** Cron entry: recompute every ticket with a running clock and send alerts. */
export async function slaTick(now = new Date()) {
  const open = await db.select({ id: sdTickets.id }).from(sdTickets)
    .where(and(notInArray(sdTickets.status, TERMINAL_STATUSES), eq(sdTickets.slaApplicable, true), notInArray(sdTickets.type, ["internal_task", "feature_request"])));
  let n = 0;
  for (const t of open) { await refreshTicketSla(t.id, now, { alert: true }).catch((e) => console.error("sla tick error:", e.message)); n++; }
  return { refreshed: n };
}

/** Retroactive recalculation after a policy/calendar change: bumps the version and logs the change (RF-SLA-05). */
export async function recalcAll(userId: number | null, reason: string, now = new Date()) {
  const ver = (await getCalcVersion()) + 1;
  // Open tickets plus anything touched in the last 120 days; older closed tickets keep their last computed values.
  const since = new Date(now.getTime() - 120 * 86_400_000);
  const all = await db.select({ id: sdTickets.id }).from(sdTickets)
    .where(and(notInArray(sdTickets.type, ["internal_task", "feature_request"]), sql`(${sdTickets.status} NOT IN ('resolved','closed','duplicate','cancelled','rejected') OR ${sdTickets.updatedAt} > ${since})`));
  let n = 0;
  for (const t of all) { await refreshTicketSla(t.id, now).catch((e) => console.error("sla recalc error:", e.message)); n++; }
  await setSetting("sla.version", ver, userId);
  await db.insert(sdSlaChanges).values({ userId, kind: "recalc", detail: { reason, version: ver, tickets: n } });
  return { version: ver, tickets: n };
}

export async function ticketsWithoutSla() {
  const rows = await db.select({ id: sdTickets.id, key: sdTickets.key, type: sdTickets.type, severity: sdTickets.severity, status: sdTickets.status, accountId: sdTickets.accountId })
    .from(sdTickets).where(and(eq(sdTickets.slaApplicable, true), notInArray(sdTickets.type, ["internal_task", "feature_request"]),
      sql`NOT EXISTS (SELECT 1 FROM sd_sla_instances i WHERE i.ticket_id = ${sdTickets.id})`));
  return rows;
}

/** Shared secret for cron endpoints (Cloud Scheduler). Only the sha256 is stored. */
export const cronTokenHash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export async function verifyCronToken(given: string): Promise<boolean> {
  if (!given) return false;
  const [row] = await db.select().from(sdSettings).where(eq(sdSettings.key, "sla.tickTokenHash"));
  if (!row) return false;
  const a = Buffer.from(cronTokenHash(given)), b = Buffer.from(String(row.value));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
