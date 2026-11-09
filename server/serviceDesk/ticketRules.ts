// Pure ticket rules (no I/O): state machines, severity/P0 rule, RCA, reopen, folio.
export const TICKET_TYPES = ["incident", "service_request", "feature_request", "question", "internal_task"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
export const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const CHANNELS = ["portal", "widget", "email", "api", "manual"] as const;

const OPS_TRANSITIONS: Record<string, string[]> = {
  new: ["triage", "in_progress", "duplicate", "cancelled", "rejected"],
  triage: ["in_progress", "waiting_customer", "duplicate", "cancelled", "rejected"],
  in_progress: ["waiting_customer", "waiting_third_party", "resolved", "duplicate", "cancelled", "rejected"],
  waiting_customer: ["in_progress", "resolved", "cancelled", "rejected"],
  waiting_third_party: ["in_progress", "resolved", "cancelled"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
  duplicate: [], cancelled: [], rejected: [],
};
const FEATURE_TRANSITIONS: Record<string, string[]> = {
  requested: ["in_review", "rejected", "deferred"],
  in_review: ["quoted", "rejected", "deferred"],
  quoted: ["approved", "rejected", "deferred"],
  approved: ["planned", "blocked", "deferred"],
  planned: ["in_development", "blocked", "deferred"],
  in_development: ["in_testing", "blocked"],
  in_testing: ["released", "in_development"],
  released: ["closed"],
  blocked: ["planned", "in_development"],
  deferred: ["in_review"],
  closed: [], rejected: [],
};

export const isFeature = (t: string) => t === "feature_request";
export const initialStatus = (t: string) => (isFeature(t) ? "requested" : "new");
export const statusesFor = (t: string) => Object.keys(isFeature(t) ? FEATURE_TRANSITIONS : OPS_TRANSITIONS);
export const nextStatuses = (t: string, from: string) => (isFeature(t) ? FEATURE_TRANSITIONS : OPS_TRANSITIONS)[from] ?? [];
export const PAUSE_STATUSES = ["waiting_customer", "waiting_third_party"];

export type Rca = { cause: string; fix: string; prevention: string; kind: "code" | "infrastructure" | "third_party" | "configuration" | "usage" };
export type TransitionCtx = {
  type: string; severity: string | null; from: string; to: string;
  reason?: string; rca?: Partial<Rca> | null; closedAt?: Date | null; now?: Date; reopenDays?: number;
};

export function validateTransition(c: TransitionCtx): { ok: true } | { ok: false; error: string } {
  if (!nextStatuses(c.type, c.from).includes(c.to)) return { ok: false, error: `Transición no permitida: ${c.from} → ${c.to}` };
  if (c.to === "waiting_third_party" && !c.reason?.trim()) return { ok: false, error: "Esperando tercero requiere motivo" };
  if ((c.to === "rejected" || c.to === "cancelled") && !c.reason?.trim()) return { ok: false, error: "Se requiere un motivo" };
  if (c.from === "closed" && c.to === "in_progress") {
    const days = c.reopenDays ?? 14;
    const ms = (c.now ?? new Date()).getTime() - (c.closedAt?.getTime() ?? 0);
    if (!c.closedAt || ms > days * 86_400_000) return { ok: false, error: `Solo se puede reabrir dentro de ${days} días del cierre` };
  }
  if (c.to === "resolved" && c.type === "incident" && (c.severity === "P0" || c.severity === "P1")) {
    const r = c.rca;
    if (!r?.cause?.trim() || !r.fix?.trim() || !r.prevention?.trim() || !r.kind) return { ok: false, error: "P0/P1 requiere causa raíz (causa, corrección, prevención y tipo)" };
  }
  return { ok: true };
}

export type P0Questionnaire = { inaccessible: boolean; criticalBlocked: boolean; hasWorkaround: boolean; users: number };
export function validateSeverity(type: string, severity: string | null | undefined, q?: Partial<P0Questionnaire> | null): { ok: true } | { ok: false; error: string } {
  if (!severity) return { ok: true };
  if (!(SEVERITIES as readonly string[]).includes(severity)) return { ok: false, error: "Severidad inválida" };
  if (type !== "incident") return { ok: false, error: "La severidad solo aplica a incidentes" };
  if (severity === "P0") {
    if (!q) return { ok: false, error: "P0 requiere el cuestionario de clasificación" };
    if (!(q.inaccessible || q.criticalBlocked) || q.hasWorkaround) return { ok: false, error: "No cumple criterios de P0 (producto inaccesible o proceso crítico bloqueado, sin workaround)" };
  }
  return { ok: true };
}

export function timestampsFor(to: string, now: Date) {
  const out: { resolvedAt?: Date | null; closedAt?: Date | null } = {};
  if (to === "resolved") out.resolvedAt = now;
  if (to === "closed") out.closedAt = now;
  if (to === "in_progress") { out.resolvedAt = null; out.closedAt = null; }
  return out;
}

export const ticketKey = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;
