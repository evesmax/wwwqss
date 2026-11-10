import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sdAccounts, sdBankAlerts, sdContacts, sdContracts, sdFeatureDates, sdFeatureQuotes, sdFeatureRequests, sdFeatures, sdSettings, sdTickets,
  sdTimeEntries, sdUatItems, clientes,
} from "@shared/schema";
import { addWorkingMs, defaultBusinessCalendar } from "./slaCalendar";
import { addComment, createTicket, publicBaseUrl, TicketError } from "./ticketService";
import { sendEmail } from "./emailService";
import { escapeHtml } from "./emailTemplates";
import { recipients } from "./slaService";
import { bankAlertsToSend, canRelease, hoursBankStatus, quoteState, validateQuote, validateUatDecision, type QuoteInput } from "./featureRules";

export const FEATURE_STATUSES = ["evaluating", "quoted", "approved", "in_development", "uat", "released", "rejected", "deferred"] as const;
export const FEATURE_PATCH_STATUSES = ["evaluating", "approved", "in_development", "rejected", "deferred"] as const; // quoted/uat/released are driven by their own actions
const num = (x: unknown) => Number(x);

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [r] = await db.select().from(sdSettings).where(eq(sdSettings.key, key));
  return r ? (r.value as T) : fallback;
}
export const quoteSlaDays = () => getSetting<number>("feature.quoteSlaDays", 5);
export const tacitDays = () => getSetting<number>("feature.tacitDays", 10);

async function contactEmails(accountId: number, roles = ["account_admin"]): Promise<string[]> {
  const rows = await db.select({ email: sdContacts.email }).from(sdContacts).where(and(eq(sdContacts.accountId, accountId), inArray(sdContacts.role, roles)));
  return rows.map((r) => r.email);
}
async function notify(to: string[], subject: string, body: string, path: string) {
  if (!to.length) return;
  await sendEmail({ to, subject, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><p>${escapeHtml(body)}</p><p><a href="${publicBaseUrl()}${path}">Abrir en el portal de soporte</a></p></div>` }).catch((e) => console.error("feature notify:", e.message));
}
const touch = (id: number) => db.update(sdFeatures).set({ updatedAt: new Date() }).where(eq(sdFeatures.id, id));

export async function createFeature(i: { title: string; description: string; productId: number | null; ticketIds: number[] }, userId: number) {
  const [f] = await db.insert(sdFeatures).values({ title: i.title, description: i.description, productId: i.productId, createdBy: userId }).returning();
  for (const t of Array.from(new Set(i.ticketIds))) await addRequest(f.id, t, 1);
  return f;
}
export async function addRequest(featureId: number, ticketId: number, weight: number) {
  const [t] = await db.select().from(sdTickets).where(eq(sdTickets.id, ticketId));
  if (!t) throw new TicketError("Ticket no encontrado", 404);
  if (t.type !== "feature_request") throw new TicketError("Solo se consolidan tickets de tipo solicitud de funcionalidad");
  const [ex] = await db.select().from(sdFeatureRequests).where(eq(sdFeatureRequests.ticketId, ticketId));
  if (ex && ex.featureId !== featureId) throw new TicketError("El ticket ya pertenece a otra funcionalidad", 409);
  if (ex) { await db.update(sdFeatureRequests).set({ weight }).where(eq(sdFeatureRequests.id, ex.id)); return ex; }
  const [r] = await db.insert(sdFeatureRequests).values({ featureId, ticketId, accountId: t.accountId, weight }).returning();
  await touch(featureId);
  return r;
}

export async function setTargetDate(featureId: number, date: string | null, reason: string, userId: number | null) {
  if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)))) throw new TicketError("Fecha inválida");
  const [f] = await db.select().from(sdFeatures).where(eq(sdFeatures.id, featureId));
  if (f.targetDate && f.targetDate !== date && !reason.trim()) throw new TicketError("Indica el motivo del cambio de fecha");
  await db.insert(sdFeatureDates).values({ featureId, targetDate: date, reason: reason.trim(), changedBy: userId });
  await db.update(sdFeatures).set({ targetDate: date, updatedAt: new Date() }).where(eq(sdFeatures.id, featureId));
}

// ---- quotes (RF-FEAT-02) ----
export async function createQuote(featureId: number, accountId: number, q: QuoteInput, userId: number) {
  const v = validateQuote(q); if (!v.ok) throw new TicketError(v.error);
  const [req] = await db.select().from(sdFeatureRequests).where(and(eq(sdFeatureRequests.featureId, featureId), eq(sdFeatureRequests.accountId, accountId))).limit(1);
  if (!req) throw new TicketError("La cuenta no tiene solicitudes en esta funcionalidad");
  const [last] = await db.select({ v: sql<number>`coalesce(max(${sdFeatureQuotes.version}),0)` }).from(sdFeatureQuotes).where(and(eq(sdFeatureQuotes.featureId, featureId), eq(sdFeatureQuotes.accountId, accountId)));
  const [row] = await db.insert(sdFeatureQuotes).values({ featureId, accountId, version: Number(last.v) + 1, scope: q.scope.trim(), hours: String(q.hours), cost: String(q.cost), currency: q.currency, assumptions: q.assumptions, validUntil: q.validUntil, outOfContract: q.outOfContract, createdBy: userId }).returning();
  return row;
}
export async function updateQuote(id: number, q: QuoteInput) {
  const [cur] = await db.select().from(sdFeatureQuotes).where(eq(sdFeatureQuotes.id, id));
  if (!cur) throw new TicketError("No encontrado", 404);
  if (cur.status !== "draft") throw new TicketError("Solo se edita una cotización en borrador; crea una nueva versión", 409);
  const v = validateQuote(q); if (!v.ok) throw new TicketError(v.error);
  const [row] = await db.update(sdFeatureQuotes).set({ scope: q.scope.trim(), hours: String(q.hours), cost: String(q.cost), currency: q.currency, assumptions: q.assumptions, validUntil: q.validUntil, outOfContract: q.outOfContract }).where(eq(sdFeatureQuotes.id, id)).returning();
  return row;
}
export async function sendQuote(id: number) {
  const [cur] = await db.select().from(sdFeatureQuotes).where(eq(sdFeatureQuotes.id, id));
  if (!cur) throw new TicketError("No encontrado", 404);
  if (cur.status !== "draft") throw new TicketError("La cotización ya fue enviada", 409);
  const v = validateQuote({ scope: cur.scope, hours: num(cur.hours), cost: num(cur.cost), currency: cur.currency, assumptions: cur.assumptions, validUntil: cur.validUntil, outOfContract: cur.outOfContract });
  if (!v.ok) throw new TicketError(v.error);
  await db.transaction(async (tx) => {
    await tx.update(sdFeatureQuotes).set({ status: "superseded" }).where(and(eq(sdFeatureQuotes.featureId, cur.featureId), eq(sdFeatureQuotes.accountId, cur.accountId), eq(sdFeatureQuotes.status, "sent")));
    await tx.update(sdFeatureQuotes).set({ status: "sent", sentAt: new Date() }).where(eq(sdFeatureQuotes.id, id));
    await tx.update(sdFeatures).set({ status: sql`CASE WHEN status = 'evaluating' THEN 'quoted' ELSE status END`, outOfContract: cur.outOfContract || sql`out_of_contract`, updatedAt: new Date() }).where(eq(sdFeatures.id, cur.featureId));
  });
  const [f] = await db.select().from(sdFeatures).where(eq(sdFeatures.id, cur.featureId));
  await notify(await contactEmails(cur.accountId), `Cotización disponible: ${f.title}`, `Preparamos una cotización para "${f.title}". Revísala y apruébala en el portal antes del ${cur.validUntil}.`, "/portal");
  return { ...cur, status: "sent" };
}
export async function decideQuote(id: number, accountIds: number[], contactId: number, decision: "approved" | "rejected", note: string) {
  const [q] = await db.select().from(sdFeatureQuotes).where(eq(sdFeatureQuotes.id, id));
  if (!q || !accountIds.includes(q.accountId)) throw new TicketError("No encontrado", 404);
  const st = quoteState(q);
  if (st === "expired") throw new TicketError("La cotización expiró; solicita una nueva", 409);
  if (st !== "sent") throw new TicketError("La cotización no está disponible para decisión", 409);
  if (decision === "rejected" && !note.trim()) throw new TicketError("Indica el motivo del rechazo");
  const upd = await db.update(sdFeatureQuotes).set({ status: decision, decidedContactId: contactId, decidedAt: new Date(), decisionNote: note.trim() })
    .where(and(eq(sdFeatureQuotes.id, id), eq(sdFeatureQuotes.status, "sent"))).returning();
  if (!upd.length) throw new TicketError("La cotización ya fue decidida", 409);
  if (decision === "approved") await db.update(sdFeatures).set({ status: sql`CASE WHEN status IN ('evaluating','quoted') THEN 'approved' ELSE status END`, updatedAt: new Date() }).where(eq(sdFeatures.id, q.featureId));
  return upd[0];
}

// ---- UAT (RF-FEAT-05) ----
export async function addUatItem(featureId: number, accountId: number, what: string, how: string) {
  if (what.trim().length < 3) throw new TicketError("Describe qué hace");
  const [f] = await db.select().from(sdFeatures).where(eq(sdFeatures.id, featureId));
  if (f.status === "released") throw new TicketError("La funcionalidad ya fue liberada", 409);
  const [req] = await db.select().from(sdFeatureRequests).where(and(eq(sdFeatureRequests.featureId, featureId), eq(sdFeatureRequests.accountId, accountId))).limit(1);
  if (!req) throw new TicketError("La cuenta no tiene solicitudes en esta funcionalidad");
  const [n] = await db.select({ c: sql<number>`count(*)` }).from(sdUatItems).where(eq(sdUatItems.featureId, featureId));
  const [row] = await db.insert(sdUatItems).values({ featureId, accountId, what: what.trim(), how: how.trim(), position: Number(n.c) }).returning();
  return row;
}
export async function startUat(featureId: number) {
  const items = await db.select().from(sdUatItems).where(eq(sdUatItems.featureId, featureId));
  if (!items.length) throw new TicketError("Agrega la lista UAT (qué hace / cómo probarlo) antes de enviar a UAT");
  const [f] = await db.select().from(sdFeatures).where(eq(sdFeatures.id, featureId));
  if (!["in_development", "approved", "uat"].includes(f.status)) throw new TicketError("La funcionalidad debe estar aprobada o en desarrollo", 409);
  await db.update(sdUatItems).set({ status: "pending", decidedAt: null, decidedContactId: null, tacit: false }).where(and(eq(sdUatItems.featureId, featureId), eq(sdUatItems.status, "no_go")));
  await db.update(sdFeatures).set({ status: "uat", uatStartedAt: new Date(), updatedAt: new Date() }).where(eq(sdFeatures.id, featureId));
  for (const a of Array.from(new Set(items.map((i) => i.accountId)))) await notify(await contactEmails(a), `Pruebas de aceptación: ${f.title}`, `"${f.title}" está lista para tus pruebas. Revisa qué hace, cómo probarla y responde Go / No Go en el portal.`, "/portal");
}
async function maybeRelease(featureId: number, kind: "go" | "tacit") {
  const items = await db.select().from(sdUatItems).where(eq(sdUatItems.featureId, featureId));
  if (!canRelease(items).ok) return false;
  const upd = await db.update(sdFeatures).set({ status: "released", releasedAt: new Date(), releaseKind: kind, updatedAt: new Date() }).where(and(eq(sdFeatures.id, featureId), eq(sdFeatures.status, "uat"))).returning();
  return upd.length > 0;
}
export async function decideUat(itemId: number, accountIds: number[], contactId: number, status: string, comment: string) {
  const v = validateUatDecision(status, comment); if (!v.ok) throw new TicketError(v.error);
  const [it] = await db.select().from(sdUatItems).where(eq(sdUatItems.id, itemId));
  if (!it || !accountIds.includes(it.accountId)) throw new TicketError("No encontrado", 404);
  const [f] = await db.select().from(sdFeatures).where(eq(sdFeatures.id, it.featureId));
  if (f.status !== "uat") throw new TicketError("La funcionalidad no está en UAT", 409);
  if (it.status !== "pending") throw new TicketError("Este ítem ya fue respondido", 409);
  const upd = await db.update(sdUatItems).set({ status, comment: comment.trim(), decidedContactId: contactId, decidedAt: new Date() }).where(and(eq(sdUatItems.id, itemId), eq(sdUatItems.status, "pending"))).returning();
  if (!upd.length) throw new TicketError("Este ítem ya fue respondido", 409);
  let childTicketId = it.childTicketId;
  if (status === "no_go") {
    const body = `UAT No Go en "${f.title}" — ${it.what}\nCómo se probó: ${it.how || "—"}\nMotivo: ${comment.trim()}`;
    let reopened = false;
    if (childTicketId) {
      try { await addComment(childTicketId, { type: "contact", id: contactId }, body, "public"); reopened = true; } catch { /* child gone or closed: fall through to a fresh ticket */ }
    }
    if (!reopened) {
      const t = await createTicket({ accountId: it.accountId, type: "incident", title: `UAT No Go: ${f.title}`.slice(0, 200), description: body, productId: f.productId, requesterContactId: contactId, channel: "portal", severity: "P3" }, { type: "contact", id: contactId });
      childTicketId = t.id;
      await db.update(sdUatItems).set({ childTicketId }).where(eq(sdUatItems.id, itemId));
    }
    await db.update(sdFeatures).set({ status: "in_development", updatedAt: new Date() }).where(eq(sdFeatures.id, it.featureId));
    return { released: false, childTicketId };
  }
  return { released: await maybeRelease(it.featureId, "go"), childTicketId };
}
export async function manualRelease(featureId: number) {
  const items = await db.select().from(sdUatItems).where(eq(sdUatItems.featureId, featureId));
  const c = canRelease(items); if (!c.ok) throw new TicketError(c.error, 409);
  const [f] = await db.select().from(sdFeatures).where(eq(sdFeatures.id, featureId));
  if (f.status !== "uat") throw new TicketError("La funcionalidad no está en UAT", 409);
  await maybeRelease(featureId, "go");
}
// Tacit acceptance: after N days in UAT, pending items count as accepted (RF-FEAT-05). Idempotent; run from the scheduler tick.
export async function featureTick(now = new Date()) {
  const days = await tacitDays();
  const cutoff = new Date(now.getTime() - days * 86400000);
  const fs = await db.select().from(sdFeatures).where(eq(sdFeatures.status, "uat"));
  let released = 0;
  for (const f of fs) {
    if (!f.uatStartedAt || f.uatStartedAt > cutoff) continue;
    const items = await db.select().from(sdUatItems).where(eq(sdUatItems.featureId, f.id));
    if (items.some((i) => i.status === "no_go")) continue;
    await db.update(sdUatItems).set({ status: "go", tacit: true, decidedAt: now, comment: "Aceptación tácita" }).where(and(eq(sdUatItems.featureId, f.id), eq(sdUatItems.status, "pending")));
    if (await maybeRelease(f.id, "tacit")) released++;
  }
  return { released };
}

// ---- feature SLA: time to quote (RF-FEAT-06) ----
export async function quoteDue(createdAt: Date) {
  const days = await quoteSlaDays();
  return addWorkingMs(defaultBusinessCalendar(), createdAt, days * 9 * 3600000);
}

// ---- hours bank ----
export async function bankSummary(accountId: number, now = new Date()) {
  const contracts = await db.select().from(sdContracts).where(and(eq(sdContracts.accountId, accountId), eq(sdContracts.active, true)));
  const banked = contracts.filter((c) => c.hoursBank != null && num(c.hoursBank) > 0);
  const bank = banked.length ? banked.reduce((s, c) => s + num(c.hoursBank), 0) : null;
  const [m] = await db.select({ m: sql<number>`coalesce(sum(${sdTimeEntries.minutes}),0)` }).from(sdTimeEntries).innerJoin(sdTickets, eq(sdTickets.id, sdTimeEntries.ticketId))
    .where(and(eq(sdTickets.accountId, accountId), eq(sdTimeEntries.billable, true)));
  const consumed = Math.round((Number(m.m) / 60) * 10) / 10;
  const st = hoursBankStatus(bank, consumed);
  const withRate = banked.find((c) => c.extraHourRate != null);
  const extraHours = st.balance != null && st.balance < 0 ? Math.round(-st.balance * 10) / 10 : 0;
  return { bankHours: bank, consumedHours: consumed, ...st, extraHours, extraRate: withRate ? num(withRate.extraHourRate) : null, extraCurrency: withRate?.extraCurrency ?? "MXN",
    extraCost: withRate ? Math.round(extraHours * num(withRate.extraHourRate) * 100) / 100 : null, contractId: banked[0]?.id ?? null, asOf: now.toISOString() };
}
export async function checkBankAlerts(accountId: number) {
  const s = await bankSummary(accountId);
  if (s.pct == null || !s.contractId) return [];
  const sent = (await db.select().from(sdBankAlerts).where(eq(sdBankAlerts.contractId, s.contractId))).map((r) => r.threshold);
  const fresh: number[] = [];
  for (const th of bankAlertsToSend(s.pct, sent)) {
    const ins = await db.insert(sdBankAlerts).values({ contractId: s.contractId, threshold: th }).onConflictDoNothing().returning();
    if (ins.length) fresh.push(th);
  }
  if (!fresh.length) return [];
  const [acc] = await db.select({ name: clientes.nombreNegocio }).from(sdAccounts).innerJoin(clientes, eq(clientes.id, sdAccounts.clienteId)).where(eq(sdAccounts.id, accountId));
  const top = Math.max(...fresh);
  const to = Array.from(new Set([...(await recipients(accountId, null, ["manager", "owner"])), ...(await contactEmails(accountId))]));
  const extra = s.extraCost != null && s.extraHours > 0 ? ` Las horas adicionales se facturan a ${s.extraRate} ${s.extraCurrency}/h.` : "";
  await notify(to, `Bolsa de horas al ${top}%: ${acc?.name ?? ""}`, `Se ha consumido el ${s.pct}% de la bolsa (${s.consumedHours} de ${s.bankHours} h).${extra}`, "/portal");
  return fresh;
}
