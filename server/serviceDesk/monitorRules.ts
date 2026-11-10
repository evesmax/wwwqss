// Pure helpers for monitors/incidents.
export function validateMonitorUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, error: "URL inválida" }; }
  if (u.protocol !== "https:") return { ok: false, error: "Solo https" };
  if (u.username || u.password) return { ok: false, error: "La URL no debe incluir credenciales" };
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || !h.includes(".")) return { ok: false, error: "Host no permitido" };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return { ok: false, error: "IP privada no permitida" };
  }
  if (h.includes(":") || h.startsWith("[")) return { ok: false, error: "IPv6 literal no permitido" };
  return { ok: true, url: u.toString() };
}

export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
export const IMPACTS = ["minor", "major", "critical"] as const;
/** Auto-incident state machine over the last N minute classes of one product's monitors. */
export function autoIncidentAction(last: ("up" | "down" | "unconfirmed" | "nodata")[], open: boolean): "open" | "resolve" | "none" {
  const l3 = last.slice(-3), l5 = last.slice(-5);
  if (!open && l3.length === 3 && l3.every((c) => c === "down")) return "open";
  if (open && l5.length === 5 && l5.every((c) => c === "up")) return "resolve";
  return "none";
}
/** A maintenance window excludes minutes only when announced at least 48h ahead (RF-AV-06). */
export const noticeOk = (createdAt: Date, startsAt: Date) => startsAt.getTime() - createdAt.getTime() >= 48 * 3_600_000;
