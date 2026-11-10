// Pure rules for feature requests: quotes, UAT, hours bank (RF-FEAT-02/05, bolsa de horas). No I/O.
export const CURRENCIES = ["MXN", "USD"] as const;
export type QuoteInput = { scope: string; hours: number; cost: number; currency: string; assumptions: string; validUntil: string; outOfContract: boolean };

export function validateQuote(q: QuoteInput, now = new Date()): { ok: true } | { ok: false; error: string } {
  if ((q.scope ?? "").trim().length < 10) return { ok: false, error: "Describe el alcance (mínimo 10 caracteres)" };
  if (!(q.hours > 0) || q.hours > 5000) return { ok: false, error: "Horas inválidas (0–5000)" };
  if (!(q.cost >= 0) || q.cost > 1e9) return { ok: false, error: "Costo inválido" };
  if (!(CURRENCIES as readonly string[]).includes(q.currency)) return { ok: false, error: "Moneda inválida" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.validUntil) || isNaN(Date.parse(q.validUntil))) return { ok: false, error: "Vigencia inválida" };
  if (Date.parse(q.validUntil + "T23:59:59Z") < now.getTime()) return { ok: false, error: "La vigencia debe ser futura" };
  return { ok: true };
}
export function quoteState(q: { status: string; validUntil: string }, now = new Date()): string {
  if (q.status === "sent" && Date.parse(q.validUntil + "T23:59:59Z") < now.getTime()) return "expired";
  return q.status;
}
export function canRelease(items: { status: string }[]): { ok: true } | { ok: false; error: string } {
  if (!items.length) return { ok: false, error: "Para liberar se requiere la lista UAT (qué hace / cómo probarlo) con Go del cliente" };
  const pending = items.filter((i) => i.status === "pending").length, nogo = items.filter((i) => i.status === "no_go").length;
  if (nogo) return { ok: false, error: `Hay ${nogo} ítem(s) UAT con No Go` };
  if (pending) return { ok: false, error: `Faltan ${pending} ítem(s) UAT por aprobar (Go) por el cliente` };
  return { ok: true };
}
export function validateUatDecision(status: string, comment: string): { ok: true } | { ok: false; error: string } {
  if (status !== "go" && status !== "no_go") return { ok: false, error: "Decisión inválida" };
  if (status === "no_go" && !comment.trim()) return { ok: false, error: "Indica el motivo del No Go" };
  return { ok: true };
}
export function hoursBankStatus(bankHours: number | null, consumedHours: number): { pct: number | null; level: "none" | "ok" | "warn" | "over"; balance: number | null } {
  if (bankHours == null || bankHours <= 0) return { pct: null, level: "none", balance: null };
  const pct = Math.round((consumedHours / bankHours) * 1000) / 10;
  return { pct, level: pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok", balance: Math.round((bankHours - consumedHours) * 10) / 10 };
}
export const bankAlertsToSend = (pct: number, alreadySent: number[]) => [80, 100].filter((t) => pct >= t && !alreadySent.includes(t));
