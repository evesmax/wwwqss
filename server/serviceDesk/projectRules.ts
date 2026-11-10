// Pure project-delivery rules (RF-PRJ-02/03/04/05/15). Business-day granularity, no I/O.
import { createHash } from "crypto";

const toUtc = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;

export function isBusinessDay(d: string, holidays: Set<string>): boolean {
  const dow = new Date(toUtc(d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(d);
}
// n business days after d (0 = d itself, or the next business day if d is not one).
export function addBusinessDays(d: string, n: number, holidays: Set<string>): string {
  let ms = toUtc(d);
  while (!isBusinessDay(fromUtc(ms), holidays)) ms += DAY;
  let left = n;
  while (left > 0) { ms += DAY; if (isBusinessDay(fromUtc(ms), holidays)) left--; }
  return fromUtc(ms);
}
// Business days in [a, b], inclusive.
export function businessDaysBetween(a: string, b: string, holidays: Set<string>): number {
  let n = 0;
  for (let ms = toUtc(a); ms <= toUtc(b); ms += DAY) if (isBusinessDay(fromUtc(ms), holidays)) n++;
  return n;
}

export type SchedTask = { id: number; days: number; deps: number[]; fixedStart?: string | null };
export function scheduleTasks(tasks: SchedTask[], projectStart: string, holidays: Set<string>): Map<number, { start: string; end: string }> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) for (const d of t.deps) if (!byId.has(d)) throw new Error(`La dependencia ${d} no existe`);
  const out = new Map<number, { start: string; end: string }>();
  const state = new Map<number, 1 | 2>();
  const visit = (t: SchedTask) => {
    if (state.get(t.id) === 2) return;
    if (state.get(t.id) === 1) throw new Error("Hay un ciclo en las dependencias");
    state.set(t.id, 1);
    let start = projectStart;
    for (const d of t.deps) { visit(byId.get(d)!); const e = out.get(d)!.end; const nx = addBusinessDays(e, 1, holidays); if (nx > start) start = nx; }
    if (t.fixedStart && t.fixedStart > start) start = t.fixedStart;
    start = addBusinessDays(start, 0, holidays);
    out.set(t.id, { start, end: addBusinessDays(start, Math.max(1, t.days) - 1, holidays) });
    state.set(t.id, 2);
  };
  tasks.forEach(visit);
  return out;
}

// Share (0..1) of a baseline task that should be done by the cut date.
export function plannedPct(t: { start: string; end: string }, asOf: string, holidays: Set<string>): number {
  if (asOf < t.start) return 0;
  if (asOf >= t.end) return 1;
  const total = businessDaysBetween(t.start, t.end, holidays);
  const done = businessDaysBetween(t.start, asOf, holidays);
  return total ? Math.round((done / total) * 1000) / 1000 : 1;
}

export type ProgTask = { id: number; hours: number | null; days: number; pct: number; start: string; end: string; internal: boolean; blockedByClient: boolean };
export function projectProgress(tasks: ProgTask[], asOf: string, holidays: Set<string>) {
  const useHours = tasks.some((t) => t.hours != null && t.hours > 0);
  let wSum = 0, a = 0, p = 0;
  for (const t of tasks) {
    const w = useHours ? (t.hours ?? 0) : t.days;
    if (!(w > 0)) continue;
    wSum += w; a += w * (t.pct / 100); p += w * plannedPct(t, asOf, holidays);
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { weightBasis: useHours ? "hours" as const : "days" as const, actual: wSum ? r1((a / wSum) * 100) : 0, planned: wSum ? r1((p / wSum) * 100) : 0, blockedByClient: tasks.filter((t) => t.blockedByClient).length };
}

export type PStatus = "on_track" | "at_risk" | "late";
export function statusFor(actual: number, planned: number, overdueGate: boolean, th = { onTrack: 0.9, atRisk: 0.75 }): PStatus {
  let s: PStatus = "on_track";
  if (planned > 0) { const r = actual / planned; s = r >= th.onTrack ? "on_track" : r >= th.atRisk ? "at_risk" : "late"; }
  if (overdueGate && s === "on_track") s = "at_risk";
  return s;
}

export type VTask = { id: number; name: string; phaseId: number | null; start: string; end: string; deps: number[]; internal: boolean; assignee: number | null; hours: number | null; pct: number; done: boolean };
export type Warning = { code: string; message: string; taskId?: number; phaseId?: number; gateId?: number };
export function validateProject(p: {
  today: string; holidays: Set<string>;
  phases: { id: number; end: string; gateId: number | null }[]; gates: { id: number; date: string; signed: boolean }[]; tasks: VTask[];
}): Warning[] {
  const w: Warning[] = [];
  const gate = new Map(p.gates.map((g) => [g.id, g])); const task = new Map(p.tasks.map((t) => [t.id, t]));
  for (const ph of p.phases) { const g = ph.gateId ? gate.get(ph.gateId) : null; if (g && ph.end > g.date) w.push({ code: "phase_after_gate", phaseId: ph.id, gateId: g.id, message: `La fase termina (${ph.end}) después de su gate (${g.date})` }); }
  for (const g of p.gates) if (!g.signed && g.date < p.today) w.push({ code: "gate_overdue", gateId: g.id, message: `El gate del ${g.date} no está firmado` });
  for (const t of p.tasks) {
    for (const d of t.deps) { const dt = task.get(d); if (dt && t.start <= dt.end) w.push({ code: "starts_before_dep", taskId: t.id, message: `"${t.name}" inicia antes de que termine "${dt.name}"` }); }
    if (t.internal && t.assignee == null) w.push({ code: "internal_no_assignee", taskId: t.id, message: `"${t.name}" no tiene responsable` });
    if (t.internal && !(t.hours && t.hours > 0)) w.push({ code: "internal_no_hours", taskId: t.id, message: `"${t.name}" no tiene esfuerzo en horas` });
    if (!isBusinessDay(t.start, p.holidays) || !isBusinessDay(t.end, p.holidays)) { if (p.holidays.has(t.start) || p.holidays.has(t.end)) w.push({ code: "on_holiday", taskId: t.id, message: `"${t.name}" cae en día feriado` }); }
    if (!t.done && t.end < p.today && t.pct === 0) w.push({ code: "overdue_no_progress", taskId: t.id, message: `"${t.name}" venció el ${t.end} sin avance` });
  }
  return w;
}

export const SIGNOFF_RESULTS = ["go", "conditional", "no_go"] as const;
export function signoffHash(i: { gateId: number; criteria: string[]; evidence: string[] }): string {
  return createHash("sha256").update(JSON.stringify({ g: i.gateId, c: i.criteria, e: i.evidence })).digest("hex");
}
export function validateSignoff(result: string, note: string): { ok: true } | { ok: false; error: string } {
  if (!(SIGNOFF_RESULTS as readonly string[]).includes(result)) return { ok: false, error: "Resultado inválido" };
  if (result !== "go" && !note.trim()) return { ok: false, error: result === "no_go" ? "Indica el motivo del No Go" : "Indica las condiciones del Go condicionado" };
  return { ok: true };
}
