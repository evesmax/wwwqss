// Pure calendar math for the SLA engine (no I/O). Times are epoch ms / Date; calendar days are local "YYYY-MM-DD".
export type Calendar =
  | { kind: "24x7" }
  | { kind: "business"; tz: string; days: number[]; start: string; end: string; holidays: string[] };

export const defaultBusinessCalendar = (): Extract<Calendar, { kind: "business" }> =>
  ({ kind: "business", tz: "America/Mexico_City", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", holidays: [] });

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}
function localParts(ms: number, tz: string) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
function offsetMs(ms: number, tz: string) {
  const p = localParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
// Local wall-clock (y,m,d,h,min) in tz -> epoch ms.
function zonedToMs(y: number, m: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let ms = guess - offsetMs(guess, tz);
  ms = guess - offsetMs(ms, tz);
  return ms;
}
const dayKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return { h, m: m || 0 }; };

const MAX_DAYS = 3660;

/** Visits working windows [startMs,endMs) clipped to [from,to), in order. Return true from the visitor to stop early. */
export function eachWindow(cal: Calendar, from: number, to: number, visit: (a: number, b: number) => boolean | void): void {
  if (to <= from) return;
  if (cal.kind === "24x7") { visit(from, to); return; }
  const hol = new Set(cal.holidays);
  const s = hm(cal.start), e = hm(cal.end);
  const p0 = localParts(from, cal.tz);
  let y = p0.year, m = p0.month, d = p0.day;
  for (let i = 0; i < MAX_DAYS; i++) {
    const noon = new Date(Date.UTC(y, m - 1, d, 12));
    const dow = noon.getUTCDay();
    const ws = zonedToMs(y, m, d, s.h, s.m, cal.tz);
    if (ws >= to) return;
    if (cal.days.includes(dow) && !hol.has(dayKey(y, m, d))) {
      const we = zonedToMs(y, m, d, e.h, e.m, cal.tz);
      const a = Math.max(ws, from), b = Math.min(we, to);
      if (b > a && visit(a, b)) return;
    }
    noon.setUTCDate(noon.getUTCDate() + 1);
    y = noon.getUTCFullYear(); m = noon.getUTCMonth() + 1; d = noon.getUTCDate();
  }
}

export function workingMs(cal: Calendar, from: Date | number, to: Date | number): number {
  let sum = 0;
  eachWindow(cal, +from, +to, (a, b) => { sum += b - a; });
  return sum;
}

/** First instant at/after `from` that is inside working time (or `from` itself if it is). */
export function nextWorkingInstant(cal: Calendar, from: Date | number): Date {
  const f = +from;
  let r = f;
  eachWindow(cal, f, f + MAX_DAYS * 86_400_000, (a) => { r = a; return true; });
  return new Date(r);
}

/** The instant at which `ms` of working time has elapsed after `from`. */
export function addWorkingMs(cal: Calendar, from: Date | number, ms: number): Date {
  const f = +from;
  if (ms <= 0) return nextWorkingInstant(cal, f);
  let left = ms, out = f + ms;
  eachWindow(cal, f, f + MAX_DAYS * 86_400_000, (a, b) => {
    if (b - a >= left) { out = a + left; return true; }
    left -= b - a;
  });
  return new Date(out);
}

function nthMonday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((8 - first) % 7) + 7 * (n - 1);
}
/** Official Mexican holidays (LFT art. 74), as local "YYYY-MM-DD", sorted. */
export function mxOfficialHolidays(year: number): string[] {
  const out = [
    dayKey(year, 1, 1),
    dayKey(year, 2, nthMonday(year, 2, 1)),
    dayKey(year, 3, nthMonday(year, 3, 3)),
    dayKey(year, 5, 1),
    dayKey(year, 9, 16),
    dayKey(year, 11, nthMonday(year, 11, 3)),
    dayKey(year, 12, 25),
  ];
  if (year >= 2024 && (year - 2024) % 6 === 0) out.push(dayKey(year, 10, 1)); // transmisión del Ejecutivo federal
  return out.sort();
}
