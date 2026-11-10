import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { sdGateSignoffs, sdHolidays, sdProjectBaselines, sdProjectGates, sdProjectPhases, sdProjects, sdProjectTasks } from "@shared/schema";
import { mxOfficialHolidays } from "./slaCalendar";
import { TicketError } from "./ticketService";
import { addBusinessDays, projectProgress, scheduleTasks, signoffHash, statusFor, validateProject, validateSignoff } from "./projectRules";

export const ORIGINS = ["qss", "customer", "third_party", "force_majeure"] as const;
type Task = typeof sdProjectTasks.$inferSelect;
type Rev = { reason: string; origin: string } | undefined;
const todayMx = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const num = (x: unknown) => (x == null ? null : Number(x));

export async function holidaysFor(accountId: number, startDate: string): Promise<Set<string>> {
  const y0 = Number(startDate.slice(0, 4)), set = new Set<string>();
  for (let y = y0 - 1; y <= y0 + 4; y++) mxOfficialHolidays(y).forEach((d) => set.add(d));
  const rows = await db.select().from(sdHolidays).where(or(isNull(sdHolidays.accountId), eq(sdHolidays.accountId, accountId)));
  rows.forEach((r) => set.add(r.date));
  return set;
}

// Generic implementation template: phases F0..F7, a gate at the end of each (G0..G7) plus G8 (retirement of the previous system).
type TplTask = { code: string; name: string; kind?: string; days: number; hours?: number; client?: boolean; deps?: string[] };
const PHASES: { code: string; name: string; gate: string; criteria: string[]; tasks: TplTask[] }[] = [
  { code: "F0", name: "Descubrimiento", gate: "Arranque del proyecto", criteria: ["Alcance y plan firmados"], tasks: [{ code: "0.1", name: "Levantamiento de requerimientos", days: 5, hours: 24 }, { code: "0.2", name: "Entrega de documentos del cliente", days: 5, client: true, kind: "task" }] },
  { code: "F1", name: "Diseño", gate: "Diseño aprobado", criteria: ["Documento de diseño aceptado"], tasks: [{ code: "1.1", name: "Diseño de la solución", days: 8, hours: 40, deps: ["0.1"] }, { code: "1.2", name: "Aprobación del diseño", days: 2, client: true, deps: ["1.1"] }] },
  { code: "F2", name: "Configuración", gate: "Configuración base lista", criteria: ["Ambiente configurado"], tasks: [{ code: "2.1", name: "Configuración del ambiente", days: 6, hours: 32, deps: ["1.2"] }, { code: "2.2", name: "Carga de catálogos", days: 4, hours: 16, deps: ["2.1"] }] },
  { code: "F3", name: "Integraciones", gate: "Integraciones validadas", criteria: ["Integraciones probadas"], tasks: [{ code: "3.1", name: "Integraciones", days: 8, hours: 40, deps: ["2.2"] }] },
  { code: "F4", name: "Pruebas (UAT)", gate: "UAT aceptado", criteria: ["Acuse de UAT por área"], tasks: [{ code: "4.1", name: "Pruebas con el cliente", days: 6, client: true, deps: ["3.1"] }, { code: "4.2", name: "Corrección de hallazgos", days: 4, hours: 24, deps: ["4.1"] }] },
  { code: "F5", name: "Capacitación", gate: "Usuarios capacitados", criteria: ["Capacitación impartida"], tasks: [{ code: "5.1", name: "Capacitación", days: 4, hours: 16, deps: ["4.2"] }] },
  { code: "F6", name: "Paralelo / Hypercare", gate: "Arranque en producción", criteria: ["Go-live autorizado"], tasks: [{ code: "6.1", name: "Operación en paralelo", days: 10, hours: 40, deps: ["5.1"] }] },
  { code: "F7", name: "Cierre", gate: "Retiro del sistema anterior", criteria: ["Sistema anterior retirado"], tasks: [{ code: "7.1", name: "Cierre y traspaso a soporte", days: 3, hours: 8, deps: ["6.1"] }] },
];
export const TEMPLATES = [{ id: "generic", name: "Implementación estándar (F0–F7)" }];

export async function createProject(i: { accountId: number; name: string; solutionType: string; startDate: string; template?: string }, userId: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.startDate) || isNaN(Date.parse(i.startDate))) throw new TicketError("Fecha de inicio inválida");
  const hol = await holidaysFor(i.accountId, i.startDate);
  const start = addBusinessDays(i.startDate, 0, hol);
  const [p] = await db.insert(sdProjects).values({ accountId: i.accountId, name: i.name, solutionType: i.solutionType, startDate: start, createdBy: userId }).returning();
  if (i.template === "generic") {
    const idOf = new Map<string, number>();
    let pos = 0;
    for (let pi = 0; pi < PHASES.length; pi++) {
      const ph = PHASES[pi];
      const [phase] = await db.insert(sdProjectPhases).values({ projectId: p.id, code: ph.code, name: ph.name, position: pi }).returning();
      for (const t of ph.tasks) {
        const [row] = await db.insert(sdProjectTasks).values({ projectId: p.id, phaseId: phase.id, code: t.code, name: t.name, kind: t.kind ?? "task", days: t.days, hours: t.hours != null ? String(t.hours) : null,
          startDate: start, endDate: start, deps: (t.deps ?? []).map((c: string) => idOf.get(c)!).filter(Boolean), clientVisible: true, clientSide: !!t.client, position: pos++ }).returning();
        idOf.set(t.code, row.id);
      }
      await db.insert(sdProjectGates).values({ projectId: p.id, phaseId: phase.id, code: `G${pi}`, name: ph.gate, date: start, criteria: ph.criteria });
      if (ph.code === "F7") await db.insert(sdProjectGates).values({ projectId: p.id, phaseId: phase.id, code: "G8", name: "Retiro del sistema anterior (cierre)", date: start, criteria: ["Sistema anterior fuera de operación"] });
    }
  }
  await reschedule(p.id);
  return p;
}

// Recompute task dates (finish-to-start), phase-end driven gate dates stay manual; gate dates default to their phase end while unsigned and unmoved.
export async function reschedule(projectId: number) {
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, projectId));
  const tasks = await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, projectId)).orderBy(asc(sdProjectTasks.position), asc(sdProjectTasks.id));
  const hol = await holidaysFor(p.accountId, p.startDate);
  let sched;
  try { sched = scheduleTasks(tasks.map((t) => ({ id: t.id, days: t.days, deps: t.deps as number[], fixedStart: t.fixedStart })), p.startDate, hol); }
  catch (e: any) { throw new TicketError(e.message); }
  for (const t of tasks) { const s = sched.get(t.id)!; if (s.start !== t.startDate || s.end !== t.endDate) await db.update(sdProjectTasks).set({ startDate: s.start, endDate: s.end, updatedAt: new Date() }).where(eq(sdProjectTasks.id, t.id)); }
  if (p.baselineVersion === 0) { // before the baseline is approved, gates follow the end of their phase
    const gates = await db.select().from(sdProjectGates).where(eq(sdProjectGates.projectId, projectId));
    for (const g of gates) {
      const ends = tasks.filter((t) => t.phaseId === g.phaseId).map((t) => sched.get(t.id)!.end);
      if (ends.length) { const d = ends.sort().slice(-1)[0]; if (d !== g.date) await db.update(sdProjectGates).set({ date: d }).where(eq(sdProjectGates.id, g.id)); }
    }
  }
}

async function snapshot(projectId: number) {
  const tasks = await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, projectId));
  const gates = await db.select().from(sdProjectGates).where(eq(sdProjectGates.projectId, projectId));
  return { tasks: tasks.map((t) => ({ id: t.id, start: t.startDate, end: t.endDate })), gates: gates.map((g) => ({ id: g.id, date: g.date })) };
}
export async function blockingWarnings(projectId: number) {
  const d: any = await loadProject(projectId, { client: false });
  return (d.warnings as any[]).filter((w: any) => ["starts_before_dep", "internal_no_hours", "internal_no_assignee"].includes(w.code));
}
export async function approvePlan(projectId: number, userId: number) {
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, projectId));
  if (p.baselineVersion >= 1) throw new TicketError("El plan ya fue aprobado; los cambios generan revisiones", 409);
  const tasks = await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, projectId));
  if (!tasks.length) throw new TicketError("El proyecto no tiene tareas");
  const blocking = await blockingWarnings(projectId);
  if (blocking.length) throw new TicketError(`No se puede aprobar el plan: ${blocking.slice(0, 3).map((w: any) => w.message).join("; ")}${blocking.length > 3 ? ` (+${blocking.length - 3})` : ""}`, 409);
  await db.insert(sdProjectBaselines).values({ projectId, version: 1, reason: "Línea base inicial", origin: "qss", approvedBy: userId, snapshot: await snapshot(projectId) });
  await db.update(sdProjects).set({ baselineVersion: 1, baselineApprovedAt: new Date(), status: "active" }).where(eq(sdProjects.id, projectId));
}
// Any schedule-affecting change after the baseline must carry a reason and origin and becomes a new revision.
export async function scheduleChange(projectId: number, userId: number, rev: Rev, apply: () => Promise<void>) {
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, projectId));
  if (p.baselineVersion >= 1 && (!rev || rev.reason.trim().length < 3 || !(ORIGINS as readonly string[]).includes(rev.origin))) throw new TicketError("Con la línea base aprobada indica el motivo y el origen del cambio (qss, customer, third_party, force_majeure)");
  await apply();
  await reschedule(projectId);
  if (p.baselineVersion >= 1) {
    const v = p.baselineVersion + 1;
    await db.insert(sdProjectBaselines).values({ projectId, version: v, reason: rev!.reason.trim(), origin: rev!.origin, approvedBy: userId, snapshot: await snapshot(projectId) });
    await db.update(sdProjects).set({ baselineVersion: v }).where(eq(sdProjects.id, projectId));
  }
}

export async function loadProject(projectId: number, opt: { client: boolean }) {
  const [p] = await db.select().from(sdProjects).where(eq(sdProjects.id, projectId));
  const phases = await db.select().from(sdProjectPhases).where(eq(sdProjectPhases.projectId, projectId)).orderBy(asc(sdProjectPhases.position));
  let tasks = await db.select().from(sdProjectTasks).where(eq(sdProjectTasks.projectId, projectId)).orderBy(asc(sdProjectTasks.position), asc(sdProjectTasks.id));
  let gates = await db.select().from(sdProjectGates).where(eq(sdProjectGates.projectId, projectId)).orderBy(asc(sdProjectGates.date), asc(sdProjectGates.id));
  const baselines = await db.select({ id: sdProjectBaselines.id, version: sdProjectBaselines.version, reason: sdProjectBaselines.reason, origin: sdProjectBaselines.origin, approvedAt: sdProjectBaselines.approvedAt, snapshot: sdProjectBaselines.snapshot }).from(sdProjectBaselines).where(eq(sdProjectBaselines.projectId, projectId)).orderBy(asc(sdProjectBaselines.version));
  const hol = await holidaysFor(p.accountId, p.startDate);
  const today = todayMx();
  const v1 = baselines.find((b) => b.version === 1)?.snapshot as { tasks: { id: number; start: string; end: string }[] } | undefined;
  const base = new Map((v1?.tasks ?? []).map((t) => [t.id, t]));
  const progTasks = tasks.map((t) => { const b = base.get(t.id); return { id: t.id, hours: num(t.hours), days: t.days, pct: t.pct, start: b?.start ?? t.startDate, end: b?.end ?? t.endDate, internal: !t.clientSide, blockedByClient: t.blockedByClient }; });
  const prog = projectProgress(progTasks, today, hol);
  const overdueGate = gates.some((g) => g.status !== "signed" && g.date < today);
  const status = statusFor(prog.actual, prog.planned, overdueGate);
  const warnings = validateProject({
    today, holidays: hol,
    phases: phases.map((ph) => { const ends = tasks.filter((t) => t.phaseId === ph.id).map((t) => t.endDate).sort(); const g = gates.filter((x) => x.phaseId === ph.id).slice(-1)[0]; return { id: ph.id, end: ends.slice(-1)[0] ?? p.startDate, gateId: g?.id ?? null }; }),
    gates: gates.map((g) => ({ id: g.id, date: g.date, signed: g.status === "signed" })),
    tasks: tasks.map((t) => ({ id: t.id, name: t.name, phaseId: t.phaseId, start: t.startDate, end: t.endDate, deps: t.deps as number[], internal: !t.clientSide, assignee: t.assigneeUserId, hours: num(t.hours), pct: t.pct, done: t.pct >= 100 })),
  });
  const view = {
    project: { id: p.id, accountId: p.accountId, name: p.name, solutionType: p.solutionType, status: p.status, startDate: p.startDate, baselineVersion: p.baselineVersion },
    progress: { ...prog, status, overdueGate, asOf: today },
    holidays: Array.from(hol).filter((d) => d >= p.startDate).sort().slice(0, 60),
  };
  if (opt.client) { // customer view: only visible items; never hours, internal notes, assignees' identities beyond "QSS/cliente", or warnings
    tasks = tasks.filter((t) => t.clientVisible); gates = gates.filter((g) => g.clientVisible);
    return {
      ...view, progress: { actual: prog.actual, planned: prog.planned, status, blockedByClient: prog.blockedByClient, asOf: today },
      phases: phases.map((ph) => ({ id: ph.id, code: ph.code, name: ph.name })),
      tasks: tasks.map((t) => ({ id: t.id, phaseId: t.phaseId, code: t.code, name: t.name, kind: t.kind, start: t.startDate, end: t.endDate, pct: t.pct, owner: t.clientSide ? "cliente" : "qss", blockedByClient: t.blockedByClient, deps: t.deps, baseline: base.get(t.id) ? { start: base.get(t.id)!.start, end: base.get(t.id)!.end } : null })),
      gates: gates.map((g) => ({ id: g.id, phaseId: g.phaseId, code: g.code, name: g.name, date: g.date, criteria: g.criteria, status: g.status, result: g.result, signedAt: g.signedAt })),
      revisions: baselines.map((b) => ({ version: b.version, reason: b.reason, origin: b.origin, approvedAt: b.approvedAt })),
    };
  }
  return {
    ...view, phases, tasks: tasks.map((t) => ({ ...t, baseline: base.get(t.id) ? { start: base.get(t.id)!.start, end: base.get(t.id)!.end } : null })), gates, warnings,
    revisions: baselines.map((b) => ({ version: b.version, reason: b.reason, origin: b.origin, approvedAt: b.approvedAt })),
  };
}

// Customer sign-off of a gate (RF-PRJ-05): records who, when, from where, and a fingerprint of what was signed.
export async function signGate(gateId: number, signer: { type: "contact" | "user"; id: number }, ip: string, result: string, note: string) {
  const v = validateSignoff(result, note); if (!v.ok) throw new TicketError(v.error);
  const [g] = await db.select().from(sdProjectGates).where(eq(sdProjectGates.id, gateId));
  if (!g) throw new TicketError("No encontrado", 404);
  if (g.status === "signed") throw new TicketError("El gate ya fue firmado", 409);
  const fingerprint = signoffHash({ gateId, criteria: g.criteria as string[], evidence: g.evidence as string[] });
  await db.transaction(async (tx) => {
    await tx.insert(sdGateSignoffs).values({ gateId, signerType: signer.type, signerId: signer.id, result, note: note.trim(), ip, fingerprint });
    await tx.update(sdProjectGates).set(result === "no_go" ? { result, status: "open" } : { result, status: "signed", signedAt: new Date() }).where(eq(sdProjectGates.id, gateId));
  });
  return { fingerprint };
}
