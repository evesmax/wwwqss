import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import {
  sdHolidays, sdProjectChanges, sdProjectCuts, sdProjectDecisions, sdProjectDocs, sdProjectGates, sdProjectModules, sdProjectPayments, sdProjectPhases, sdProjectRisks, sdProjects, sdProjectTasks, sdContacts, users,
} from "@shared/schema";
import { TicketError } from "./ticketService";
import { sendEmail } from "./emailService";
import { holidaysFor, loadProject, reschedule, scheduleChange } from "./projectService";
import { audit, loadProjectFull, setting } from "./projectItemService";
import { buildCut, changeNext, lastCutDate, parseScheduleCsv, renderCutHtml, validateChange } from "./projectP2bRules";
import { nextCode, riskLevel } from "./projectItemRules";

const todayMx = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const base = () => (process.env.PUBLIC_BASE_URL || "https://qsoftwaresolutions.com").replace(/\/+$/, "");

// ================= change control (RF-PRJ-10) =================
export type ChangeInput = { title: string; description?: string; hoursImpact?: number; costImpact?: number; currency?: string; daysImpact?: number; taskSpec?: { name: string; phaseId?: number | null } | null; ticketId?: number | null };
async function codeFor(projectId: number) {
  const rows = await db.select({ c: sdProjectChanges.code }).from(sdProjectChanges).where(eq(sdProjectChanges.projectId, projectId));
  return nextCode("CC", rows.map((r) => r.c));
}
export async function createChange(projectId: number, userId: number | null, i: ChangeInput) {
  const impact = { hoursImpact: i.hoursImpact ?? 0, costImpact: i.costImpact ?? 0, daysImpact: i.daysImpact ?? 0 };
  const v = validateChange({ title: i.title, ...impact }); if (!v.ok) throw new TicketError(v.error);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const [row] = await db.insert(sdProjectChanges).values({ projectId, code: await codeFor(projectId), title: i.title.trim(), description: i.description ?? "", ticketId: i.ticketId ?? null,
        hoursImpact: String(impact.hoursImpact), costImpact: String(impact.costImpact), currency: i.currency ?? "MXN", daysImpact: impact.daysImpact, taskSpec: i.taskSpec ?? null, createdBy: userId }).returning();
      await audit(projectId, userId, "change", row.id, "create", { code: row.code });
      return row;
    } catch (e: any) { if (!/unique|duplicate/i.test(e.message)) throw e; }
  }
  throw new TicketError("No se pudo asignar el código, reintenta", 409);
}
export async function updateChange(id: number, patch: Partial<ChangeInput>) {
  const [c] = await db.select().from(sdProjectChanges).where(eq(sdProjectChanges.id, id));
  if (!c) throw new TicketError("No encontrado", 404);
  if (c.status !== "draft") throw new TicketError("Solo se edita un cambio en borrador; una propuesta enviada no se modifica", 409);
  const next = { title: patch.title ?? c.title, hoursImpact: patch.hoursImpact ?? Number(c.hoursImpact), costImpact: patch.costImpact ?? Number(c.costImpact), daysImpact: patch.daysImpact ?? c.daysImpact };
  const v = validateChange(next); if (!v.ok) throw new TicketError(v.error);
  await db.update(sdProjectChanges).set({ title: next.title.trim(), description: patch.description ?? c.description, hoursImpact: String(next.hoursImpact), costImpact: String(next.costImpact), daysImpact: next.daysImpact, currency: patch.currency ?? c.currency, taskSpec: patch.taskSpec === undefined ? c.taskSpec : patch.taskSpec }).where(eq(sdProjectChanges.id, id));
}
export async function proposeChange(id: number, userId: number) {
  const [c] = await db.select().from(sdProjectChanges).where(eq(sdProjectChanges.id, id));
  if (!c) throw new TicketError("No encontrado", 404);
  if (!changeNext(c.status, "propose")) throw new TicketError("El cambio ya fue propuesto", 409);
  await db.update(sdProjectChanges).set({ status: "proposed", proposedAt: new Date() }).where(eq(sdProjectChanges.id, id));
  await audit(c.projectId, userId, "change", id, "proposed", {});
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, c.projectId));
  const to = (await db.select().from(sdContacts).where(and(eq(sdContacts.accountId, p.accountId), eq(sdContacts.role, "account_admin")))).map((x) => x.email);
  if (to.length) await sendEmail({ to, subject: `Cambio ${c.code} por aprobar: ${c.title}`, html: `<p>Se propone un cambio al alcance del proyecto <b>${p.name}</b>: ${c.title}.</p><p>Impacto: ${c.daysImpact} día(s) hábiles y ${Number(c.costImpact).toLocaleString("es-MX")} ${c.currency}.</p><p><a href="${base()}/portal/project">Revisar y decidir en el portal</a></p>` }).catch(() => {});
}
// Only the customer's account_admin decides. Approval applies the change as a baseline revision; only approved changes move the plan.
export async function decideChange(id: number, contactId: number, decision: "approve" | "reject", note: string) {
  const [c] = await db.select().from(sdProjectChanges).where(eq(sdProjectChanges.id, id));
  if (!c) throw new TicketError("No encontrado", 404);
  const nxt = changeNext(c.status, decision);
  if (!nxt) throw new TicketError("El cambio no está pendiente de decisión", 409);
  if (decision === "reject" && !note.trim()) throw new TicketError("Indica el motivo del rechazo");
  await db.update(sdProjectChanges).set({ status: nxt, decidedByContactId: contactId, decidedAt: new Date(), decisionNote: note.trim() }).where(eq(sdProjectChanges.id, id));
  await audit(c.projectId, null, "change", id, nxt, { contactId, note: note.trim() });
  if (nxt === "approved") await applyChange(id, null);
}
export async function applyChange(id: number, userId: number | null) {
  const [c] = await db.select().from(sdProjectChanges).where(eq(sdProjectChanges.id, id));
  if (!c) throw new TicketError("No encontrado", 404);
  if (!changeNext(c.status, "apply")) throw new TicketError("Solo un cambio aprobado por el cliente puede aplicarse al plan", 409);
  const spec = c.taskSpec as { name?: string; phaseId?: number | null } | null;
  await scheduleChange(c.projectId, userId ?? 0, { reason: `Cambio ${c.code} aprobado por el cliente: ${c.title}`, origin: "customer" }, async () => {
    if (!spec?.name) return;
    const phases = await db.select().from(sdProjectPhases).where(eq(sdProjectPhases.projectId, c.projectId)).orderBy(asc(sdProjectPhases.position));
    const phase = phases.find((p) => p.id === spec.phaseId) ?? phases[phases.length - 1];
    const n = (await db.select({ id: sdProjectTasks.id }).from(sdProjectTasks).where(eq(sdProjectTasks.projectId, c.projectId))).length;
    const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, c.projectId));
    await db.insert(sdProjectTasks).values({ projectId: c.projectId, phaseId: phase?.id ?? null, code: c.code, name: spec.name, days: Math.max(1, c.daysImpact), hours: c.hoursImpact, deps: [], startDate: p.startDate, endDate: p.startDate, position: n });
  });
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, c.projectId));
  await db.update(sdProjectChanges).set({ status: "applied", appliedAt: new Date(), appliedBaselineVersion: p.baselineVersion }).where(eq(sdProjectChanges.id, id));
  await audit(c.projectId, userId, "change", id, "applied", { baselineVersion: p.baselineVersion });
}
// A feature request in an account with an active plan becomes a draft change request (RF-PRJ-10). Idempotent per ticket.
export async function maybeChangeFromTicket(t: { id: number; accountId: number; type: string; title: string; description?: string | null }) {
  if (t.type !== "feature_request") return null;
  const ps = await db.select().from(sdProjects).where(and(eq(sdProjects.accountId, t.accountId), ne(sdProjects.status, "closed")));
  // With several active plans the request goes to the most recent one (an internal draft: a manager can recreate it elsewhere).
  const p = ps.filter((x) => x.baselineVersion >= 1).sort((x, y) => y.id - x.id)[0];
  if (!p) return null;
  const [dup] = await db.select().from(sdProjectChanges).where(and(eq(sdProjectChanges.projectId, p.id), eq(sdProjectChanges.ticketId, t.id)));
  if (dup) return dup;
  return createChange(p.id, null, { title: t.title, description: t.description ?? "", ticketId: t.id, taskSpec: { name: t.title } });
}
export async function loadChanges(projectId: number, client: boolean) {
  const rows = await db.select().from(sdProjectChanges).where(eq(sdProjectChanges.projectId, projectId)).orderBy(asc(sdProjectChanges.id));
  if (!client) return rows;
  // The customer sees what it must decide on: days and cost, never hours; drafts stay internal.
  return rows.filter((c) => c.status !== "draft").map((c) => ({ id: c.id, code: c.code, title: c.title, description: c.description, daysImpact: c.daysImpact, costImpact: c.costImpact, currency: c.currency, status: c.status, decisionNote: c.decisionNote, decidedAt: c.decidedAt }));
}

// ================= status cuts (RF-PRJ-14) =================
export async function collectCut(projectId: number, asOf = todayMx()) {
  const v: any = await loadProjectFull(projectId, { client: true });
  return buildCut({
    asOf, project: { name: v.project.name, status: v.project.status },
    progress: { actual: v.progress.actual, planned: v.progress.planned, status: v.progress.status },
    gates: v.gates.map((g: any) => ({ code: g.code, name: g.name, date: g.date, status: g.status })),
    blocked: v.tasks.filter((t: any) => t.blockedByClient && t.pct < 100).map((t: any) => ({ code: t.code, name: t.name })),
    docsOverdue: v.docs.filter((d: any) => d.overdue).map((d: any) => ({ code: d.code, name: d.name, dueDate: d.dueDate })),
    decisions: v.decisions.map((d: any) => ({ code: d.code, question: d.question, deadline: d.deadline, state: d.state, defaultDecision: d.defaultDecision })),
    risks: v.risks.map((r: any) => ({ code: r.code, title: r.title, level: r.level })),
    payments: v.payments.map((x: any) => ({ name: x.name, dueDate: x.dueDate, status: x.status, amount: x.amount, currency: x.currency })),
  });
}
export const cutHtml = (data: any) => renderCutHtml(data, { logoUrl: `${base()}/qss-logo.png`, portalUrl: `${base()}/portal/project` });

export async function generateCut(projectId: number, userId: number | null, asOf = todayMx(), force = false) {
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, projectId));
  if (!p) throw new TicketError("No encontrado", 404);
  if (p.baselineVersion < 1) throw new TicketError("Aprueba el plan (línea base) antes de emitir cortes de estatus", 409);
  const [ex] = await db.select().from(sdProjectCuts).where(and(eq(sdProjectCuts.projectId, projectId), eq(sdProjectCuts.cutDate, asOf)));
  if (ex && !force) return ex;
  if (ex && ex.status !== "draft") throw new TicketError("El corte de esa fecha ya fue aprobado: es inmutable", 409);
  const data = await collectCut(projectId, asOf);
  if (ex) { await db.update(sdProjectCuts).set({ data: data as any, createdBy: userId }).where(eq(sdProjectCuts.id, ex.id)); return { ...ex, data }; }
  const [row] = await db.insert(sdProjectCuts).values({ projectId, cutDate: asOf, data: data as any, createdBy: userId }).returning();
  return row;
}
export async function approveCut(id: number, userId: number) {
  const [c] = await db.select().from(sdProjectCuts).where(eq(sdProjectCuts.id, id));
  if (!c) throw new TicketError("No encontrado", 404);
  if (c.status !== "draft") throw new TicketError("El corte ya fue aprobado", 409);
  await db.update(sdProjectCuts).set({ status: "approved", approvedBy: userId, approvedAt: new Date() }).where(eq(sdProjectCuts.id, id));
}
export async function sendCut(id: number, userId: number | null) {
  const [c] = await db.select().from(sdProjectCuts).where(eq(sdProjectCuts.id, id));
  if (!c) throw new TicketError("No encontrado", 404);
  if (c.status === "draft") throw new TicketError("El corte debe aprobarse antes de enviarse", 409);
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, c.projectId));
  const { recipientsFor } = await import("./reportService");
  const to = await recipientsFor(p.accountId);
  if (!to.length) throw new TicketError("La cuenta no tiene destinatarios (administradores de cuenta o lista del contrato)");
  const html = cutHtml(c.data), subject = `Corte de estatus · ${p.name} · ${c.cutDate}`;
  const results: { to: string; status: string; error?: string; at: string }[] = [];
  for (const email of to) { const s = await sendEmail({ to: email, subject, html }); results.push({ to: email, status: s.status, error: s.error, at: new Date().toISOString() }); }
  const sent = results.some((x) => x.status === "sent");
  await db.update(sdProjectCuts).set({ status: sent || c.status === "sent" ? "sent" : c.status, sentAt: c.sentAt ?? (sent ? new Date() : null), sendLog: [...((c.sendLog as any[]) ?? []), { by: userId, results }] as any }).where(eq(sdProjectCuts.id, id));
  return { recipients: to.length, sent: results.filter((x) => x.status === "sent").length, results };
}
// Cron: on/after the configured weekday (default Friday) create the draft cut for every project with an approved plan. Idempotent per cut date.
export async function cutTick(now = new Date()) {
  const weekday = Math.min(6, Math.max(0, Number(await setting("project.cutDay", "5"))));
  const date = lastCutDate(new Date(now.getTime() - 6 * 3600000).toISOString().slice(0, 10), weekday);
  let created = 0;
  for (const p of await db.select().from(sdProjects).where(ne(sdProjects.status, "closed"))) {
    if (p.baselineVersion < 1) continue;
    const [ex] = await db.select({ id: sdProjectCuts.id }).from(sdProjectCuts).where(and(eq(sdProjectCuts.projectId, p.id), eq(sdProjectCuts.cutDate, date)));
    if (ex) continue;
    await generateCut(p.id, null, date).then(() => { created++; }).catch((e) => console.error("cut:", e.message));
  }
  return { created, date };
}
export async function listCuts(projectId: number, client: boolean) {
  const rows = await db.select().from(sdProjectCuts).where(eq(sdProjectCuts.projectId, projectId)).orderBy(desc(sdProjectCuts.cutDate));
  return rows.filter((r) => !client || r.status !== "draft").map((r) => ({ id: r.id, cutDate: r.cutDate, status: r.status, approvedAt: r.approvedAt, sentAt: r.sentAt, progress: (r.data as any).progress }));
}

// ================= schedule importer (RF-PRJ-18) =================
export async function previewSchedule(accountId: number, csv: string) {
  const hol = await holidaysFor(accountId, todayMx());
  const r = parseScheduleCsv(csv, hol);
  return { phases: r.phases.length, tasks: r.tasks.length, gates: r.gates.length, payments: r.payments.length, holidays: r.holidays.length, errors: r.errors,
    refs: { doc: uniq(r.tasks.flatMap((t) => t.refs.doc)), decision: uniq(r.tasks.flatMap((t) => t.refs.decision)), risk: uniq(r.tasks.flatMap((t) => t.refs.risk)), module: uniq(r.tasks.flatMap((t) => t.refs.module)) },
    sample: r.tasks.slice(0, 8).map((t) => ({ code: t.code, name: t.name, start: t.start, end: t.end, days: t.days, pct: t.pct, owner: t.clientSide ? "cliente" : t.assignee || "—" })) };
}
const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();

// Loads the file as a DRAFT project for human review: it never approves a baseline. Files with errors are refused (no silent partial loads).
export async function importSchedule(i: { accountId: number; name: string; solutionType: string; csv: string }, userId: number) {
  const hol = await holidaysFor(i.accountId, todayMx());
  const r = parseScheduleCsv(i.csv, hol);
  if (r.errors.length) throw new TicketError(`El archivo tiene ${r.errors.length} error(es): corrígelos y vuelve a cargarlo (líneas ${r.errors.slice(0, 5).map((e) => e.line).join(", ")}…)`);
  if (!r.tasks.length) throw new TicketError("El archivo no contiene tareas");
  const start = r.tasks.map((t) => t.start).sort()[0];
  const existingHol = new Set((await db.select().from(sdHolidays).where(eq(sdHolidays.accountId, i.accountId))).map((h) => h.date));
  for (const d of r.holidays) if (!existingHol.has(d)) await db.insert(sdHolidays).values({ accountId: i.accountId, date: d, name: "Importado del cronograma" });
  const [p] = await db.insert(sdProjects).values({ accountId: i.accountId, name: i.name, solutionType: i.solutionType, startDate: start, createdBy: userId }).returning();
  const phaseId = new Map<string, number>();
  for (let pi = 0; pi < r.phases.length; pi++) { const [ph] = await db.insert(sdProjectPhases).values({ projectId: p.id, code: r.phases[pi].code, name: r.phases[pi].name, position: pi }).returning(); phaseId.set(r.phases[pi].code, ph.id); }
  const us = await db.select({ id: users.id, username: users.username }).from(users);
  const cs = await db.select().from(sdContacts).where(eq(sdContacts.accountId, i.accountId));
  const norm = (s: string) => s.trim().toLowerCase();
  // stubs for P/R/DOC/MOD references so the codes of the original file are preserved; hidden from the customer until reviewed
  const docId = new Map<string, number>();
  const need = (k: keyof (typeof r.tasks)[number]["refs"]) => uniq(r.tasks.flatMap((t) => t.refs[k]));
  for (const code of need("doc")) { const t = r.tasks.find((x) => x.refs.doc.includes(code))!; const [d] = await db.insert(sdProjectDocs).values({ projectId: p.id, code, name: `${code} (importado — completar)`, dueDate: t.start, clientVisible: false }).returning(); docId.set(code, d.id); }
  for (const code of need("decision")) { const t = r.tasks.find((x) => x.refs.decision.includes(code))!; await db.insert(sdProjectDecisions).values({ projectId: p.id, code, question: `${code} (importado — completar la pregunta)`, defaultDecision: "Por definir", deadline: t.end, clientVisible: false }); }
  for (const code of need("risk")) await db.insert(sdProjectRisks).values({ projectId: p.id, code, title: `${code} (importado — completar)`, probability: 2, impact: 2 });
  for (const code of need("module")) await db.insert(sdProjectModules).values({ projectId: p.id, code, name: `${code} (importado — completar)` });
  let pos = 0;
  for (const t of r.tasks) {
    const asg = t.clientSide ? null : us.find((u) => norm(u.username) === norm(t.assignee));
    const contact = t.clientSide ? cs.find((c) => norm(c.name) === norm(t.assignee) || norm(c.email) === norm(t.assignee)) : null;
    await db.insert(sdProjectTasks).values({ projectId: p.id, phaseId: t.phaseCode ? phaseId.get(t.phaseCode) ?? null : null, code: t.code, name: t.name, days: t.days, fixedStart: t.start, deps: [], startDate: t.start, endDate: t.end, pct: t.pct,
      progressNote: t.pct > 0 && t.pct < 100 ? "Importado del cronograma" : "", assigneeUserId: asg?.id ?? null, assigneeContactId: contact?.id ?? null, clientSide: t.clientSide, notes: t.notes, docIds: t.refs.doc.map((c) => docId.get(c)!).filter(Boolean), position: pos++ });
  }
  const gateByPhase = new Map<string, boolean>();
  for (const g of r.gates) { await db.insert(sdProjectGates).values({ projectId: p.id, phaseId: g.phaseCode ? phaseId.get(g.phaseCode) ?? null : null, code: g.code, name: g.name, date: g.date, dateLocked: true }); gateByPhase.set(g.phaseCode, true); }
  const gates = await db.select().from(sdProjectGates).where(eq(sdProjectGates.projectId, p.id));
  for (const x of r.payments) await db.insert(sdProjectPayments).values({ projectId: p.id, name: x.name, amount: String(x.amount), dueDate: x.dueDate, gateId: null });
  await reschedule(p.id);
  await audit(p.id, userId, "project", p.id, "imported", { tasks: r.tasks.length, gates: gates.length, payments: r.payments.length });
  return { id: p.id, tasks: r.tasks.length, gates: gates.length, payments: r.payments.length, note: "Cargado como borrador: revisa responsables, horas y dependencias y aprueba la línea base cuando esté listo." };
}
export { inArray, riskLevel, loadProject };
