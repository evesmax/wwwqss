// Pure availability math (RF-AV-02/03). A minute is down when >=2 distinct locations fail it.
import { zonedToMs } from "./slaCalendar";

const MIN = 60_000;
export type Probe = { minute: number; location: string; ok: boolean };
export type MinuteClass = "up" | "down" | "unconfirmed" | "nodata";

export function classifyMinute(results: { location: string; ok: boolean }[]): MinuteClass {
  if (!results.length) return "nodata";
  const failing = new Set(results.filter((r) => !r.ok).map((r) => r.location));
  if (failing.size >= 2) return "down";
  const oks = results.some((r) => r.ok);
  if (failing.size === 1 && !oks) return "unconfirmed"; // a single vantage failing cannot be confirmed
  return "up";
}

export function monthRange(year: number, month: number, tz: string) {
  const ny = month === 12 ? year + 1 : year, nm = month === 12 ? 1 : month + 1;
  return { fromMs: zonedToMs(year, month, 1, 0, 0, tz), toMs: zonedToMs(ny, nm, 1, 0, 0, tz) };
}

export type AvailabilityInput = { fromMs: number; toMs: number; nowMs: number; probes: Probe[]; maintenance: { startMs: number; endMs: number }[] };
export type Availability = {
  elapsedMinutes: number; downMinutes: number; noDataMinutes: number; unconfirmedMinutes: number; maintenanceMinutes: number;
  downMinutesInMaintenance: number; coverage: number; pct: number | null;
};

export function computeAvailability(i: AvailabilityInput): Availability {
  const from = Math.ceil(i.fromMs / MIN) * MIN;
  const end = Math.min(i.toMs, Math.floor(i.nowMs / MIN) * MIN);
  const byMinute = new Map<number, Map<string, boolean>>();
  for (const p of i.probes) {
    if (p.minute < from || p.minute >= end) continue;
    const m = byMinute.get(p.minute) ?? new Map<string, boolean>();
    m.set(p.location, (m.get(p.location) ?? true) && p.ok); // a location counts as ok only if all its probes in the minute were ok
    byMinute.set(p.minute, m);
  }
  const inMaint = (t: number) => i.maintenance.some((w) => t >= w.startMs && t < w.endMs);
  let elapsed = 0, down = 0, nodata = 0, unconf = 0, maint = 0, downInMaint = 0;
  for (let t = from; t < end; t += MIN) {
    elapsed++;
    const cls = classifyMinute(Array.from(byMinute.get(t)?.entries() ?? []).map(([location, ok]) => ({ location, ok })));
    if (inMaint(t)) { maint++; if (cls === "down") downInMaint++; continue; }
    if (cls === "down") down++; else if (cls === "nodata") nodata++; else if (cls === "unconfirmed") unconf++;
  }
  const monitored = elapsed - maint - nodata;
  return {
    elapsedMinutes: elapsed, downMinutes: down, noDataMinutes: nodata, unconfirmedMinutes: unconf, maintenanceMinutes: maint, downMinutesInMaintenance: downInMaint,
    coverage: elapsed - maint > 0 ? monitored / (elapsed - maint) : 0,
    pct: monitored > 0 ? Math.round((100 - (down / monitored) * 100) * 10000) / 10000 : null,
  };
}

export type DayStatus = "operational" | "degraded" | "outage" | "nodata";
export function dailyStatus(a: { elapsedMinutes: number; downMinutes: number; noDataMinutes: number }): DayStatus {
  if (a.elapsedMinutes === 0 || a.noDataMinutes >= a.elapsedMinutes) return "nodata";
  if (a.downMinutes === 0) return "operational";
  return a.downMinutes >= 120 ? "outage" : "degraded";
}
