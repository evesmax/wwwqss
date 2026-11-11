// Pure rules for project objects: client documents (DOC), decisions (P), risks (R), resource load, payments (RF-PRJ-06/07/08/11/13/15).
import { isBusinessDay } from "./projectRules";

const toUtc = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toUtc(s));

export const DOC_STATUSES = ["pendiente", "parcial", "recibido", "validado", "rechazado"] as const;
export const DOC_PRIORITIES = ["A", "B"] as const;
const OUTSTANDING = ["pendiente", "parcial", "rechazado"];

export const docOverdue = (d: { status: string; dueDate: string }, today: string) => OUTSTANDING.includes(d.status) && d.dueDate < today;
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);
// Which reminder is due today: 2 days ahead, overdue, or escalate to the sponsor after `escalateAfter` days late.
export function docReminder(d: { status: string; dueDate: string }, today: string, escalateAfter = 3): "before" | "overdue" | "escalate" | null {
  if (!OUTSTANDING.includes(d.status)) return null;
  const late = daysBetween(d.dueDate, today);
  if (late >= escalateAfter) return "escalate";
  if (late >= 1) return "overdue";
  return late >= -2 ? "before" : null;
}
export function tasksBlockedByDocs(tasks: { id: number; docIds: number[]; pct: number }[], docs: { id: number; status: string; dueDate: string }[], today: string): number[] {
  const bad = new Set(docs.filter((d) => docOverdue(d, today)).map((d) => d.id));
  return tasks.filter((t) => t.pct < 100 && t.docIds.some((x) => bad.has(x))).map((t) => t.id);
}
export function validateDoc(d: { name: string; priority: string; dueDate: string }): { ok: true } | { ok: false; error: string } {
  if ((d.name ?? "").trim().length < 3) return { ok: false, error: "Indica el nombre del documento" };
  if (!(DOC_PRIORITIES as readonly string[]).includes(d.priority)) return { ok: false, error: "Prioridad inválida (A o B)" };
  if (!isDate(d.dueDate)) return { ok: false, error: "Fecha compromiso inválida" };
  return { ok: true };
}

export const decisionState = (d: { status: string; deadline: string }, today: string): "open" | "expired" | "decided" =>
  d.status !== "open" ? "decided" : d.deadline < today ? "expired" : "open";

export const riskLevel = (p: number, i: number): "low" | "medium" | "high" => {
  if (![p, i].every((x) => Number.isInteger(x) && x >= 1 && x <= 3)) throw new Error("Probabilidad e impacto deben ser 1..3");
  const s = p * i; return s >= 6 ? "high" : s >= 3 ? "medium" : "low";
};
export function validateRisk(r: { title: string; probability: number; impact: number }): { ok: true } | { ok: false; error: string } {
  if ((r.title ?? "").trim().length < 3) return { ok: false, error: "Indica el riesgo" };
  try { riskLevel(r.probability, r.impact); } catch (e: any) { return { ok: false, error: e.message }; }
  return { ok: true };
}

export const mondayOf = (d: string) => { const dow = new Date(toUtc(d)).getUTCDay(); return fromUtc(toUtc(d) - ((dow + 6) % 7) * DAY); };
// Planned hours per person per ISO week (Monday), spread evenly over the task's business days. Ignores unassigned tasks and tasks without hours.
export function resourceLoad(tasks: { assignee: number | null; hours: number | null; start: string; end: string }[], holidays: Set<string>, capacity = 40) {
  const acc = new Map<string, number>();
  for (const t of tasks) {
    if (t.assignee == null || !(t.hours && t.hours > 0)) continue;
    const days: string[] = [];
    for (let ms = toUtc(t.start); ms <= toUtc(t.end); ms += DAY) if (isBusinessDay(fromUtc(ms), holidays)) days.push(fromUtc(ms));
    if (!days.length) continue;
    const per = t.hours / days.length;
    for (const d of days) { const k = `${t.assignee}|${mondayOf(d)}`; acc.set(k, (acc.get(k) ?? 0) + per); }
  }
  const out: { assignee: number; week: string; hours: number; capacity: number; over: boolean }[] = [];
  acc.forEach((h, k) => { const [a, w] = k.split("|"); const hours = Math.round(h * 10) / 10; out.push({ assignee: Number(a), week: w, hours, capacity, over: hours > capacity }); });
  return out.sort((x, y) => x.assignee - y.assignee || (x.week < y.week ? -1 : 1));
}

export function paymentWarnings(payments: { id: number; name: string; dueDate: string; gateId: number | null }[], gates: { id: number; date: string; code: string }[]) {
  const g = new Map(gates.map((x) => [x.id, x]));
  const out: { code: string; paymentId: number; internalOnly: true; message: string }[] = [];
  for (const p of payments) { const gate = p.gateId ? g.get(p.gateId) : null; if (gate && p.dueDate < gate.date) out.push({ code: "payment_before_gate", paymentId: p.id, internalOnly: true, message: `"${p.name}" (${p.dueDate}) es anterior a su gate ${gate.code} (${gate.date})` }); }
  return out;
}

// Next sequential code like DOC-08 (two-digit minimum).
export function nextCode(prefix: string, existing: string[]): string {
  let max = 0;
  for (const c of existing) { const m = new RegExp(`^${prefix}-(\\d+)$`).exec(c); if (m) max = Math.max(max, Number(m[1])); }
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}
