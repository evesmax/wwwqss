import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  sdContacts, sdContracts, sdProjectAudit, sdProjectDecisions, sdProjectDocs, sdProjectGates, sdProjectModules, sdProjectPayments, sdProjectRisks, sdProjects, sdProjectTasks, sdSettings, users,
} from "@shared/schema";
import { TicketError } from "./ticketService";
import { sendEmail } from "./emailService";
import { recipients } from "./slaService";
import { DOC_STATUSES, decisionState, docOverdue, docReminder, nextCode, paymentWarnings, resourceLoad, riskLevel, tasksBlockedByDocs, validateDoc, validateRisk } from "./projectItemRules";
import { holidaysFor } from "./projectService";

const todayMx = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const base = () => (process.env.PUBLIC_BASE_URL || "https://qsoftwaresolutions.com").replace(/\/+$/, "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function setting(key: string, def: string): Promise<string> {
  const [r] = await db.select().from(sdSettings).where(eq(sdSettings.key, key));
  return r?.value != null ? String(r.value) : def;
}
export async function audit(projectId: number, userId: number | null, entity: string, entityId: number | null, action: string, detail: Record<string, unknown> = {}) {
  await db.insert(sdProjectAudit).values({ projectId, userId, entity, entityId, action, detail });
}
// Records every change of customer visibility (RF-PRJ-19).
export async function auditVisibility(projectId: number, userId: number | null, entity: string, entityId: number, from: boolean, to: boolean) {
  if (from !== to) await audit(projectId, userId, entity, entityId, "visibility", { from, to });
}

type Tbl = typeof sdProjectDocs | typeof sdProjectDecisions | typeof sdProjectRisks | typeof sdProjectModules;
async function insertWithCode<T>(projectId: number, tbl: Tbl, prefix: string, make: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await db.select({ c: (tbl as any).code }).from(tbl as any).where(eq((tbl as any).projectId, projectId));
    const code = nextCode(prefix, rows.map((r: any) => r.c));
    try { return await make(code); } catch (e: any) { if (!/unique|duplicate/i.test(e.message)) throw e; }
  }
  throw new TicketError("No se pudo asignar el código, reintenta", 409);
}

// ---------- DOC-xx ----------
export async function createDoc(projectId: number, userId: number, i: { name: string; priority: string; dueDate: string; ownerContactId?: number | null; clientVisible?: boolean }) {
  const v = validateDoc(i); if (!v.ok) throw new TicketError(v.error);
  const doc = await insertWithCode(projectId, sdProjectDocs, "DOC", async (code) => (await db.insert(sdProjectDocs).values({ projectId, code, name: i.name.trim(), priority: i.priority, dueDate: i.dueDate, ownerContactId: i.ownerContactId ?? null, clientVisible: i.clientVisible ?? true }).returning())[0]);
  await audit(projectId, userId, "doc", doc.id, "create", { code: doc.code });
  return doc;
}
export async function updateDoc(docId: number, actor: { type: "user" | "contact"; id: number }, patch: { name?: string; priority?: string; dueDate?: string; status?: string; ownerContactId?: number | null; clientVisible?: boolean; files?: string[]; comment?: string }) {
  const [d] = await db.select().from(sdProjectDocs).where(eq(sdProjectDocs.id, docId));
  if (!d) throw new TicketError("No encontrado", 404);
  const set: any = { updatedAt: new Date() };
  if (actor.type === "contact") { // the customer only reports delivery; QSS validates
    if (patch.status && !["parcial", "recibido"].includes(patch.status)) throw new TicketError("El cliente solo puede marcar el documento como parcial o recibido");
    if (patch.status === "recibido" && !(patch.files?.length || (d.files as string[]).length)) throw new TicketError("Indica el archivo o enlace entregado");
    if (patch.status) set.status = patch.status;
    if (patch.files) set.files = Array.from(new Set([...(d.files as string[]), ...patch.files.map((f) => f.trim()).filter(Boolean)])).slice(0, 30);
  } else {
    if (patch.status) {
      if (!(DOC_STATUSES as readonly string[]).includes(patch.status)) throw new TicketError("Estado inválido");
      if (patch.status === "rechazado" && !(patch.comment ?? "").trim()) throw new TicketError("Indica el motivo del rechazo");
      set.status = patch.status;
    }
    if (patch.name !== undefined || patch.priority !== undefined || patch.dueDate !== undefined) {
      const v = validateDoc({ name: patch.name ?? d.name, priority: patch.priority ?? d.priority, dueDate: patch.dueDate ?? d.dueDate }); if (!v.ok) throw new TicketError(v.error);
      if (patch.name !== undefined) set.name = patch.name.trim(); if (patch.priority !== undefined) set.priority = patch.priority; if (patch.dueDate !== undefined) { set.dueDate = patch.dueDate; set.lastReminder = null; }
    }
    if (patch.ownerContactId !== undefined) set.ownerContactId = patch.ownerContactId;
    if (patch.clientVisible !== undefined) { set.clientVisible = patch.clientVisible; await auditVisibility(d.projectId, actor.id, "doc", d.id, d.clientVisible, patch.clientVisible); }
    if (patch.files) set.files = patch.files.map((f) => f.trim()).filter(Boolean).slice(0, 30);
  }
  if ((patch.comment ?? "").trim()) set.comments = [...(d.comments as any[]), { at: new Date().toISOString(), by: actor.type, id: actor.id, text: patch.comment!.trim().slice(0, 2000) }];
  await db.update(sdProjectDocs).set(set).where(eq(sdProjectDocs.id, docId));
  if (set.status && set.status !== d.status) await audit(d.projectId, actor.type === "user" ? actor.id : null, "doc", d.id, "status", { from: d.status, to: set.status, by: actor.type });
  await syncBlocked(d.projectId);
}

// Tasks needing an overdue document are flagged "blocked by client" (RF-PRJ-06); the flag clears when the document arrives.
export async function syncBlocked(projectId: number) {
  const today = todayMx();
  const docs = await db.select().from(sdProjectDocs).where(eq(sdProjectDocs.projectId, projectId));
  const tasks = await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, projectId));
  const linked = tasks.filter((t) => (t.docIds as number[]).length);
  const blocked = new Set(tasksBlockedByDocs(linked.map((t) => ({ id: t.id, docIds: t.docIds as number[], pct: t.pct })), docs, today));
  for (const t of linked) if (t.blockedByClient !== blocked.has(t.id)) await db.update(sdProjectTasks).set({ blockedByClient: blocked.has(t.id) }).where(eq(sdProjectTasks.id, t.id));
}

// ---------- P-xx ----------
export async function createDecision(projectId: number, userId: number, i: { question: string; options?: string[]; defaultDecision: string; deadline: string; decider?: string; clientVisible?: boolean }) {
  if ((i.question ?? "").trim().length < 5) throw new TicketError("Indica la pregunta a decidir");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.deadline)) throw new TicketError("Fecha límite inválida");
  if (!(i.defaultDecision ?? "").trim()) throw new TicketError("Indica la decisión por defecto");
  const row = await insertWithCode(projectId, sdProjectDecisions, "P", async (code) => (await db.insert(sdProjectDecisions).values({ projectId, code, question: i.question.trim(), options: (i.options ?? []).map((o) => o.trim()).filter(Boolean), defaultDecision: i.defaultDecision.trim(), deadline: i.deadline, decider: (i.decider ?? "").trim(), clientVisible: i.clientVisible ?? true }).returning())[0]);
  await audit(projectId, userId, "decision", row.id, "create", { code: row.code });
  return row;
}
export async function decide(decisionId: number, actor: { type: "user" | "contact"; id: number }, decision: string, impact = "") {
  const [d] = await db.select().from(sdProjectDecisions).where(eq(sdProjectDecisions.id, decisionId));
  if (!d) throw new TicketError("No encontrado", 404);
  if (d.status !== "open") throw new TicketError("La decisión ya fue tomada", 409);
  if (!(decision ?? "").trim()) throw new TicketError("Indica la decisión");
  await db.update(sdProjectDecisions).set({ status: "decided", decision: decision.trim(), decidedAt: new Date(), decidedByContactId: actor.type === "contact" ? actor.id : null, impact: impact.trim() || d.impact }).where(eq(sdProjectDecisions.id, decisionId));
  await audit(d.projectId, actor.type === "user" ? actor.id : null, "decision", d.id, "decided", { by: actor.type, decision: decision.trim() });
}
// Records the acceptance of the default value once the deadline passed (traceable; only if the contract allows it).
export async function acceptDefault(decisionId: number, userId: number | null, auto = false) {
  const [d] = await db.select().from(sdProjectDecisions).where(eq(sdProjectDecisions.id, decisionId));
  if (!d) throw new TicketError("No encontrado", 404);
  if (decisionState(d, todayMx()) !== "expired") throw new TicketError("La decisión aún no vence o ya fue tomada", 409);
  await db.update(sdProjectDecisions).set({ status: "defaulted", decision: d.defaultDecision, decidedAt: new Date() }).where(eq(sdProjectDecisions.id, decisionId));
  await audit(d.projectId, userId, "decision", d.id, "defaulted", { auto, decision: d.defaultDecision });
}

// ---------- R-xx ----------
export async function createRisk(projectId: number, userId: number, i: { title: string; probability: number; impact: number; ownerUserId?: number | null; mitigation?: string; triggerText?: string; taskIds?: number[]; shared?: boolean }) {
  const v = validateRisk(i); if (!v.ok) throw new TicketError(v.error);
  await checkTasks(projectId, i.taskIds ?? []);
  const row = await insertWithCode(projectId, sdProjectRisks, "R", async (code) => (await db.insert(sdProjectRisks).values({ projectId, code, title: i.title.trim(), probability: i.probability, impact: i.impact, ownerUserId: i.ownerUserId ?? null, mitigation: i.mitigation ?? "", triggerText: i.triggerText ?? "", taskIds: i.taskIds ?? [], shared: i.shared ?? false }).returning())[0]);
  await audit(projectId, userId, "risk", row.id, "create", { code: row.code });
  return row;
}
export async function checkTasks(projectId: number, ids: number[]) {
  if (!ids.length) return;
  const ts = await db.select({ id: sdProjectTasks.id }).from(sdProjectTasks).where(and(eq(sdProjectTasks.projectId, projectId), inArray(sdProjectTasks.id, ids)));
  if (ts.length !== new Set(ids).size) throw new TicketError("Tarea inválida");
}
export const riskView = (r: typeof sdProjectRisks.$inferSelect) => ({ ...r, level: riskLevel(r.probability, r.impact) });

// ---------- MOD-xx ----------
export const MODULE_STATUSES = ["planned", "in_dev", "uat", "released"] as const;
export async function createModule(projectId: number, userId: number, i: { name: string; description?: string }) {
  if ((i.name ?? "").trim().length < 2) throw new TicketError("Indica el nombre del módulo");
  const row = await insertWithCode(projectId, sdProjectModules, "MOD", async (code) => (await db.insert(sdProjectModules).values({ projectId, code, name: i.name.trim(), description: i.description ?? "" }).returning())[0]);
  await audit(projectId, userId, "module", row.id, "create", { code: row.code });
  return row;
}
export async function setModuleStatus(moduleId: number, userId: number, status: string) {
  if (!(MODULE_STATUSES as readonly string[]).includes(status)) throw new TicketError("Estado inválido");
  const [m] = await db.select().from(sdProjectModules).where(eq(sdProjectModules.id, moduleId));
  if (!m) throw new TicketError("No encontrado", 404);
  await db.update(sdProjectModules).set({ status, releasedAt: status === "released" ? (m.releasedAt ?? new Date()) : null }).where(eq(sdProjectModules.id, moduleId));
  await audit(m.projectId, userId, "module", m.id, "status", { from: m.status, to: status });
}
// The catalog of an account (all its non-closed projects) feeds the ticket "module" field and the monthly report.
export async function moduleCatalog(accountId: number) {
  return db.select({ code: sdProjectModules.code, name: sdProjectModules.name, status: sdProjectModules.status, releasedAt: sdProjectModules.releasedAt, projectId: sdProjectModules.projectId })
    .from(sdProjectModules).innerJoin(sdProjects, eq(sdProjects.id, sdProjectModules.projectId)).where(eq(sdProjects.accountId, accountId)).orderBy(asc(sdProjectModules.code));
}
// Canonical name when the text matches a catalog module (by code or name, case-insensitive); otherwise unchanged.
export async function canonicalModule(accountId: number, text: string): Promise<string> {
  const t = (text ?? "").trim(); if (!t) return "";
  const cat = await moduleCatalog(accountId);
  const hit = cat.find((m) => m.code.toLowerCase() === t.toLowerCase() || m.name.toLowerCase() === t.toLowerCase());
  return hit ? hit.name : t;
}

// ---------- payments (read-only mirror of QFactura Hub) ----------
export const PAYMENT_STATUSES = ["pending", "invoiced", "paid"] as const;
export async function createPayment(projectId: number, userId: number, i: { name: string; amount: number; currency?: string; dueDate: string; gateId?: number | null; deliverable?: string; status?: string; clientVisible?: boolean }) {
  if ((i.name ?? "").trim().length < 2) throw new TicketError("Indica el concepto del pago");
  if (!(i.amount >= 0)) throw new TicketError("Monto inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) throw new TicketError("Fecha comprometida inválida");
  if (i.status && !(PAYMENT_STATUSES as readonly string[]).includes(i.status)) throw new TicketError("Estatus inválido");
  if (i.gateId) { const [g] = await db.select().from(sdProjectGates).where(and(eq(sdProjectGates.id, i.gateId), eq(sdProjectGates.projectId, projectId))); if (!g) throw new TicketError("Gate inválido"); }
  const [row] = await db.insert(sdProjectPayments).values({ projectId, name: i.name.trim(), amount: String(i.amount), currency: i.currency ?? "MXN", dueDate: i.dueDate, gateId: i.gateId ?? null, deliverable: i.deliverable ?? "", status: i.status ?? "pending", clientVisible: i.clientVisible ?? false }).returning();
  await audit(projectId, userId, "payment", row.id, "create", {});
  return row;
}

// ---------- handoff to operation (RF-PRJ-16) ----------
export async function pauseSlaForProject(accountId: number) {
  await db.update(sdContracts).set({ lifecycle: "implementation" }).where(and(eq(sdContracts.accountId, accountId), eq(sdContracts.active, true), eq(sdContracts.lifecycle, "operation")));
}
export async function applyGateEffects(gateId: number, userId: number | null) {
  const [g] = await db.select().from(sdProjectGates).where(eq(sdProjectGates.id, gateId));
  if (!g || g.status !== "signed" || g.kind === "normal") return;
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, g.projectId));
  if (g.kind === "handoff") {
    const now = new Date();
    await db.update(sdProjects).set({ handoffAt: now, status: "parallel" }).where(eq(sdProjects.id, p.id));
    const cs = await db.select().from(sdContracts).where(and(eq(sdContracts.accountId, p.accountId), eq(sdContracts.active, true)));
    for (const c of cs) await db.update(sdContracts).set({ lifecycle: "parallel", slaActiveFrom: c.slaActiveFrom && c.slaActiveFrom < now ? c.slaActiveFrom : now }).where(eq(sdContracts.id, c.id));
    await audit(p.id, userId, "project", p.id, "handoff", { gate: g.code, slaActiveFrom: now.toISOString() });
  } else if (g.kind === "close") {
    await db.update(sdProjects).set({ status: "closed" }).where(eq(sdProjects.id, p.id));
    await db.update(sdContracts).set({ lifecycle: "operation" }).where(and(eq(sdContracts.accountId, p.accountId), eq(sdContracts.active, true)));
    await audit(p.id, userId, "project", p.id, "closed", { gate: g.code });
  }
}

// ---------- load per resource (RF-PRJ-13, internal) ----------
export async function loadByResource(projectId: number) {
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, projectId));
  const hol = await holidaysFor(p.accountId, p.startDate);
  const tasks = await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, projectId));
  const cap = Number(await setting("project.weeklyCapacityHours", "40")) || 40;
  const rows = resourceLoad(tasks.filter((t) => t.pct < 100).map((t) => ({ assignee: t.assigneeUserId, hours: t.hours != null ? Number(t.hours) : null, start: t.startDate, end: t.endDate })), hol, cap);
  const ids = Array.from(new Set(rows.map((r) => r.assignee)));
  const us = ids.length ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids)) : [];
  const name = new Map(us.map((u) => [u.id, u.username]));
  return { capacity: cap, rows: rows.map((r) => ({ ...r, name: name.get(r.assignee) ?? `#${r.assignee}` })) };
}

// ---------- items for the project view ----------
export async function loadItems(projectId: number, client: boolean) {
  const today = todayMx();
  const [docs, decisions, risks, modules, payments, gates] = await Promise.all([
    db.select().from(sdProjectDocs).where(eq(sdProjectDocs.projectId, projectId)).orderBy(asc(sdProjectDocs.dueDate), asc(sdProjectDocs.id)),
    db.select().from(sdProjectDecisions).where(eq(sdProjectDecisions.projectId, projectId)).orderBy(asc(sdProjectDecisions.deadline), asc(sdProjectDecisions.id)),
    db.select().from(sdProjectRisks).where(eq(sdProjectRisks.projectId, projectId)).orderBy(asc(sdProjectRisks.id)),
    db.select().from(sdProjectModules).where(eq(sdProjectModules.projectId, projectId)).orderBy(asc(sdProjectModules.code)),
    db.select().from(sdProjectPayments).where(eq(sdProjectPayments.projectId, projectId)).orderBy(asc(sdProjectPayments.dueDate)),
    db.select().from(sdProjectGates).where(eq(sdProjectGates.projectId, projectId)),
  ]);
  const docV = (d: typeof docs[number]) => ({ id: d.id, code: d.code, name: d.name, priority: d.priority, dueDate: d.dueDate, status: d.status, ownerContactId: d.ownerContactId, files: d.files, comments: d.comments, overdue: docOverdue(d, today), clientVisible: d.clientVisible });
  const decV = (d: typeof decisions[number]) => ({ id: d.id, code: d.code, question: d.question, options: d.options, defaultDecision: d.defaultDecision, deadline: d.deadline, decider: d.decider, status: d.status, state: decisionState(d, today), decision: d.decision, decidedAt: d.decidedAt, impact: d.impact, clientVisible: d.clientVisible });
  if (client) {
    return {
      docs: docs.filter((d) => d.clientVisible).map(docV), decisions: decisions.filter((d) => d.clientVisible).map(decV),
      risks: risks.filter((r) => r.shared).map((r) => ({ id: r.id, code: r.code, title: r.title, level: riskLevel(r.probability, r.impact), mitigation: r.mitigation, status: r.status })),
      modules: modules.map((m) => ({ id: m.id, code: m.code, name: m.name, description: m.description, status: m.status, releasedAt: m.releasedAt })),
      payments: payments.filter((x) => x.clientVisible).map((x) => ({ id: x.id, name: x.name, amount: x.amount, currency: x.currency, dueDate: x.dueDate, status: x.status, deliverable: x.deliverable })),
      itemWarnings: [] as { code: string; message: string }[],
    };
  }
  const itemWarnings: { code: string; message: string; internalOnly?: boolean }[] = [];
  for (const d of docs) if (docOverdue(d, today)) itemWarnings.push({ code: "doc_overdue", message: `${d.code} "${d.name}" venció el ${d.dueDate} y no se ha recibido` });
  for (const d of decisions) if (decisionState(d, today) === "expired") itemWarnings.push({ code: "decision_expired", message: `${d.code} venció el ${d.deadline} sin decisión (por defecto: ${d.defaultDecision})` });
  for (const w of paymentWarnings(payments.map((x) => ({ id: x.id, name: x.name, dueDate: x.dueDate, gateId: x.gateId })), gates.map((g) => ({ id: g.id, date: g.date, code: g.code })))) itemWarnings.push({ code: w.code, message: w.message, internalOnly: true });
  return { docs: docs.map(docV), decisions: decisions.map(decV), risks: risks.map(riskView), modules, payments, itemWarnings };
}

// ---------- tick: reminders, escalation, default-decision handling ----------
async function contactsOf(accountId: number, roles?: string[]) {
  const cs = await db.select().from(sdContacts).where(eq(sdContacts.accountId, accountId));
  return roles ? cs.filter((c) => roles.includes(c.role)) : cs;
}
export async function projectTick(now = new Date()) {
  const today = todayMx();
  const out = { reminders: 0, escalations: 0, decisions: 0, defaulted: 0 };
  const projects = await db.select().from(sdProjects);
  const autoDefault = (await setting("project.autoDefaultDecisions", "false")) === "true";
  const escalateAfter = Number(await setting("project.docEscalateDays", "3")) || 3;
  for (const p of projects) {
    if (p.status === "closed") continue;
    const link = `${base()}/portal/project`;
    const docs = await db.select().from(sdProjectDocs).where(eq(sdProjectDocs.projectId, p.id));
    for (const d of docs) {
      const kind = docReminder(d, today, escalateAfter);
      if (!kind || d.lastReminder === kind && d.lastReminderAt && d.lastReminderAt.toISOString().slice(0, 10) === today) continue;
      if (kind === d.lastReminder && kind !== "overdue") continue; // "before" and "escalate" are sent once; "overdue" repeats daily
      const owner = d.ownerContactId ? (await db.select().from(sdContacts).where(eq(sdContacts.id, d.ownerContactId)))[0] : null;
      const sponsors = (await contactsOf(p.accountId, ["account_admin"])).map((c) => c.email);
      const staff = kind === "escalate" ? await recipients(p.accountId, null, ["manager"]) : [];
      const to = Array.from(new Set([...(owner ? [owner.email] : []), ...(kind === "escalate" ? sponsors : [])]));
      if (!to.length && !staff.length) continue;
      const subj = kind === "before" ? `Recordatorio: ${d.code} vence el ${d.dueDate}` : kind === "overdue" ? `${d.code} está vencido (${d.dueDate})` : `Escalación: ${d.code} lleva días vencido`;
      await sendEmail({ to: Array.from(new Set([...to, ...staff])), subject: subj, html: `<p>Proyecto <b>${esc(p.name)}</b></p><p>${esc(d.code)} — ${esc(d.name)} (prioridad ${esc(d.priority)}), fecha compromiso ${esc(d.dueDate)}.</p><p><a href="${link}">Ver en el portal</a></p>` });
      await db.update(sdProjectDocs).set({ lastReminder: kind, lastReminderAt: now }).where(eq(sdProjectDocs.id, d.id));
      if (kind === "escalate") out.escalations++; else out.reminders++;
    }
    await syncBlocked(p.id);
    const decs = await db.select().from(sdProjectDecisions).where(and(eq(sdProjectDecisions.projectId, p.id), eq(sdProjectDecisions.status, "open"), isNull(sdProjectDecisions.notifiedAt)));
    for (const d of decs) {
      if (decisionState(d, today) !== "expired") continue;
      const to = Array.from(new Set([...(await contactsOf(p.accountId, ["account_admin"])).map((c) => c.email), ...(await recipients(p.accountId, null, ["manager"]))]));
      if (to.length) await sendEmail({ to, subject: `Decisión vencida: ${d.code}`, html: `<p>${esc(d.question)}</p><p>Venció el ${esc(d.deadline)}. Valor por defecto: <b>${esc(d.defaultDecision)}</b>.</p><p><a href="${link}">Ver en el portal</a></p>` });
      await db.update(sdProjectDecisions).set({ notifiedAt: now }).where(eq(sdProjectDecisions.id, d.id));
      out.decisions++;
      if (autoDefault) { await acceptDefault(d.id, null, true); out.defaulted++; }
    }
  }
  return out;
}

// Full project view = schedule view + DOC/P/R/MOD/payments, with the customer/internal split enforced here.
export async function loadProjectFull(projectId: number, opt: { client: boolean }) {
  const { loadProject } = await import("./projectService");
  const v: any = await loadProject(projectId, opt);
  const items = await loadItems(projectId, opt.client);
  const { loadChanges } = await import("./projectP2bService");
  const changes = await loadChanges(projectId, opt.client);
  if (opt.client) { const { itemWarnings: _w, ...c } = items as any; return { ...v, ...c, changes }; }
  const { itemWarnings, ...rest } = items;
  return { ...v, ...rest, changes, warnings: [...(v.warnings ?? []), ...itemWarnings] };
}
