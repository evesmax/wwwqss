// Customer-safe projection of a ticket's SLA (RF-SLA-08). Never exposes exclusion reasons, policy names or internal metrics.
import type { MetricResult } from "./slaEngine";

export const CUSTOMER_METRICS = ["first_response", "resolution"];
const PAUSE_LABEL: Record<string, string> = { waiting_customer: "Esperando tu respuesta", waiting_third_party: "Esperando a un tercero" };

export type CustomerSla = {
  metrics: { key: string; state: "running" | "met" | "breached"; targetMinutes: number; remainingMs: number; dueAt: string | null; paused: boolean;
    pauses: { reason: string; label: string; from: string; to: string | null; note?: string }[] }[];
};
export function toCustomerSla(view: { applicable: boolean; metrics: MetricResult[] } | null): CustomerSla | null {
  if (!view || !view.applicable || !view.metrics.length) return null;
  if (view.metrics.some((m) => m.state === "excluded" || m.state === "cancelled")) return null;
  return {
    metrics: view.metrics.filter((m) => CUSTOMER_METRICS.includes(m.key)).map((m) => ({
      key: m.key,
      state: m.state === "met" ? "met" : m.state === "breached" ? "breached" : "running",
      targetMinutes: Math.round(m.targetMs / 60_000),
      remainingMs: m.remainingMs,
      dueAt: m.state === "met" ? null : m.dueAt ? m.dueAt.toISOString() : null,
      paused: m.paused,
      pauses: m.pauses.filter((p) => p.reason !== "resolved").map((p) => ({
        reason: p.reason, label: PAUSE_LABEL[p.reason] ?? p.reason, from: p.from.toISOString(), to: p.to ? p.to.toISOString() : null,
        ...(p.reason === "waiting_third_party" && p.note ? { note: p.note } : {}),
      })),
    })),
  };
}
