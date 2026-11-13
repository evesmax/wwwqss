// Pure SLA engine (no I/O). Same inputs always give the same output (RF-SLA-05/09).
import { eachWindow, workingMs, type Calendar } from "./slaCalendar";

export type SlaEvent = { at: Date; kind: string; actorType: string; detail: Record<string, unknown> };
export type Policy = { id: number; name: string; firstResponseMin: number | null; updateMin: number | null; resolutionMin: number | null };
export type PolicyFilters = { plans?: string[]; productIds?: number[]; accountIds?: number[]; types?: string[]; severities?: string[] };
export type PauseReason = "waiting_customer" | "waiting_third_party" | "resolved";
export type Pause = { reason: PauseReason; from: Date; to: Date | null; note?: string };
export type MetricKey = "first_response" | "update" | "resolution";
export type MetricState = "running" | "at_risk" | "met" | "breached" | "excluded" | "cancelled";
export type MetricResult = {
  key: MetricKey; targetMs: number; elapsedMs: number; remainingMs: number; dueAt: Date | null; pctUsed: number;
  state: MetricState; paused: boolean; pauses: Pause[]; startedAt: Date; stoppedAt: Date | null; breaches: number;
};
export const NO_SLA_TYPES = ["internal_task", "feature_request"];
export const AT_RISK_PCT = 0.75;

export function selectPolicy<T extends Policy & { filters?: PolicyFilters }>(
  policies: T[], t: { type: string; severity: string | null; accountId: number; productId: number | null; plan: string | null },
): T | null {
  for (const p of policies) {
    const f = p.filters ?? {};
    if (f.types?.length && !f.types.includes(t.type)) continue;
    if (f.severities?.length && !(t.severity && f.severities.includes(t.severity))) continue;
    if (f.accountIds?.length && !f.accountIds.includes(t.accountId)) continue;
    if (f.productIds?.length && !(t.productId != null && f.productIds.includes(t.productId))) continue;
    if (f.plans?.length && !(t.plan && f.plans.includes(t.plan))) continue;
    return p;
  }
  return null;
}

export type Derived = { pauses: Pause[]; resolvedAt: Date | null; cancelledAt: Date | null; firstResponseAt: Date | null };
export function derivePauses(events: SlaEvent[]): Derived {
  const pauses: Pause[] = [];
  let open: Pause | null = null;
  let cancelledAt: Date | null = null, firstResponseAt: Date | null = null;
  for (const e of events) {
    if (e.kind === "first_response" && !firstResponseAt) firstResponseAt = e.at;
    if (e.kind !== "status_changed") continue;
    const to = String(e.detail.to ?? ""), reason = String(e.detail.reason ?? "").trim();
    if (open && open.reason === "resolved" && to === "closed") continue; // resolved -> closed keeps the original stop
    if (open) { open.to = e.at; open = null; }
    if (to === "cancelled" || to === "rejected" || to === "duplicate") { cancelledAt = e.at; continue; }
    if (to === "waiting_customer") open = { reason: "waiting_customer", from: e.at, to: null };
    else if (to === "waiting_third_party" && reason) open = { reason: "waiting_third_party", from: e.at, to: null, note: reason };
    else if (to === "resolved" || to === "closed") open = { reason: "resolved", from: e.at, to: null };
    if (open) pauses.push(open);
  }
  let resolvedAt: Date | null = null;
  if (open && (open as Pause).reason === "resolved") { resolvedAt = (open as Pause).from; pauses.pop(); }
  return { pauses, resolvedAt, cancelledAt, firstResponseAt };
}

function eachActive(cal: Calendar, pauses: Pause[], from: number, to: number, now: number, visit: (a: number, b: number) => boolean | void): void {
  eachWindow(cal, from, to, (a, b) => {
    let cur = a;
    for (const p of pauses) {
      const pf = +p.from, pt = p.to ? +p.to : now;
      if (pt <= cur || pf >= b) continue;
      if (pf > cur && visit(cur, pf)) return true;
      cur = Math.max(cur, pt);
      if (cur >= b) break;
    }
    if (cur < b && visit(cur, b)) return true;
  });
}
const activeMs = (cal: Calendar, pauses: Pause[], from: number, to: number, now: number) => {
  let s = 0;
  eachActive(cal, pauses, from, to, now, (a, b) => { s += b - a; });
  return s;
};
function dueFrom(cal: Calendar, pauses: Pause[], from: number, target: number, now: number): Date {
  let left = target, out = from + target;
  eachActive(cal, pauses, from, from + 3660 * 86_400_000, now, (a, b) => {
    if (b - a >= left) { out = a + left; return true; }
    left -= b - a;
  });
  return new Date(out);
}

function metric(o: {
  key: MetricKey; cal: Calendar; pauses: Pause[]; start: Date; stop: Date | null; targetMin: number; now: Date; breaches?: number;
}): MetricResult {
  const target = o.targetMin * 60_000, now = +o.now;
  const end = o.stop ? +o.stop : now;
  const elapsed = Math.min(activeMs(o.cal, o.pauses, +o.start, end, now), Number.MAX_SAFE_INTEGER);
  const pct = target ? elapsed / target : 0;
  let state: MetricState;
  if (o.stop) state = elapsed <= target ? "met" : "breached";
  else state = elapsed > target ? "breached" : pct >= AT_RISK_PCT ? "at_risk" : "running";
  const openPause = o.pauses.find((p) => p.to === null && p.reason !== "resolved");
  return {
    key: o.key, targetMs: target, elapsedMs: elapsed, remainingMs: Math.max(0, target - elapsed), pctUsed: pct, state,
    dueAt: dueFrom(o.cal, o.pauses, +o.start, target, now), paused: !!openPause && !o.stop,
    pauses: o.pauses.filter((p) => +p.from < end || p.to === null), startedAt: o.start, stoppedAt: o.stop, breaches: o.breaches ?? 0,
  };
}

export type TicketSlaInput = {
  ticket: { type: string; severity: string | null; slaApplicable: boolean; createdAt: Date };
  events: SlaEvent[]; policy: Policy; calendar: Calendar; now: Date;
};
export type TicketSla = { applicable: boolean; metrics: MetricResult[] };

export function computeTicketSla(i: TicketSlaInput): TicketSla {
  if (NO_SLA_TYPES.includes(i.ticket.type)) return { applicable: false, metrics: [] };
  const d = derivePauses(i.events);
  const created = i.ticket.createdAt, pol = i.policy, cal = i.calendar, now = i.now;
  const out: MetricResult[] = [];
  if (pol.firstResponseMin != null)
    out.push(metric({ key: "first_response", cal, pauses: d.pauses, start: created, stop: d.firstResponseAt ?? d.resolvedAt ?? d.cancelledAt, targetMin: pol.firstResponseMin, now }));
  if (pol.updateMin != null) {
    const comms = [created, ...i.events.filter((e) => e.kind === "comment" && (e.actorType === "user" || e.actorType === "agent") && e.detail.visibility === "public").map((e) => e.at)]
      .filter((at) => !d.resolvedAt || +at <= +d.resolvedAt)
      .sort((a, b) => +a - +b);
    let breaches = 0;
    const target = pol.updateMin * 60_000;
    for (let k = 1; k < comms.length; k++) if (activeMs(cal, d.pauses, +comms[k - 1], +comms[k], +now) > target) breaches++;
    const last = comms[comms.length - 1];
    const cur = metric({ key: "update", cal, pauses: d.pauses, start: last, stop: d.resolvedAt ?? d.cancelledAt, targetMin: pol.updateMin, now, breaches });
    if (cur.state === "breached") cur.breaches = breaches + 1;
    if (cur.state === "met" && breaches > 0) cur.state = "breached";
    out.push(cur);
  }
  if (pol.resolutionMin != null)
    out.push(metric({ key: "resolution", cal, pauses: d.pauses, start: created, stop: d.resolvedAt ?? d.cancelledAt, targetMin: pol.resolutionMin, now }));
  const override: MetricState | null = !i.ticket.slaApplicable ? "excluded" : d.cancelledAt ? "cancelled" : null;
  if (override) for (const m of out) m.state = override;
  return { applicable: true, metrics: out };
}

export { workingMs };
