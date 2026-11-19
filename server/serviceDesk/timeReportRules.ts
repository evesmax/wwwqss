// Pure aggregation for the internal time-investment report (no I/O).
export type TimeRow = { minutes: number; agentKeyId: number | null; workDate: string; ticketId: number; key: string; title: string; type: string; accountId: number; productId: number | null };
export type Names = { accounts: Map<number, string>; products: Map<number, string> };
export const DEFAULT_RATE = { perHour: 400, currency: "MXN" };

export type Bucket = { id: number | string | null; name: string; minutes: number; humanMinutes: number; agentMinutes: number; cost: number; tickets: number };

export const costOf = (minutes: number, perHour: number) => Math.round((minutes / 60) * perHour * 100) / 100;

function group(rows: TimeRow[], keyOf: (r: TimeRow) => [number | string | null, string], perHour: number): Bucket[] {
  const m = new Map<string, Bucket & { set: Set<number> }>();
  for (const r of rows) {
    const [id, name] = keyOf(r), k = String(id);
    const b = m.get(k) ?? { id, name, minutes: 0, humanMinutes: 0, agentMinutes: 0, cost: 0, tickets: 0, set: new Set<number>() };
    b.minutes += r.minutes; r.agentKeyId != null ? (b.agentMinutes += r.minutes) : (b.humanMinutes += r.minutes); b.set.add(r.ticketId);
    m.set(k, b);
  }
  return Array.from(m.values()).map(({ set, ...b }) => ({ ...b, tickets: set.size, cost: costOf(b.minutes, perHour) })).sort((a, b) => b.minutes - a.minutes);
}

export function buildTimeReport(rows: TimeRow[], names: Names, perHour: number) {
  const tickets = new Set(rows.map((r) => r.ticketId));
  const minutes = rows.reduce((a, r) => a + r.minutes, 0);
  const agentMinutes = rows.filter((r) => r.agentKeyId != null).reduce((a, r) => a + r.minutes, 0);
  const acc = (r: TimeRow): [number, string] => [r.accountId, names.accounts.get(r.accountId) ?? `Cuenta ${r.accountId}`];
  const prod = (r: TimeRow): [number | null, string] => [r.productId, r.productId == null ? "Sin producto" : names.products.get(r.productId) ?? `Producto ${r.productId}`];
  const perTicket = group(rows, (r) => [r.ticketId, `${r.key} — ${r.title}`], perHour);
  return {
    totals: { minutes, humanMinutes: minutes - agentMinutes, agentMinutes, cost: costOf(minutes, perHour), tickets: tickets.size, entries: rows.length },
    byAccount: group(rows, acc, perHour),
    byProduct: group(rows, prod, perHour),
    byType: group(rows, (r) => [r.type, r.type], perHour),
    byAccountProduct: group(rows, (r) => { const [a, an] = acc(r), [p, pn] = prod(r); return [`${a}:${p}`, `${an} · ${pn}`]; }, perHour),
    topTickets: perTicket.slice(0, 15),
    timeline: group(rows, (r) => [r.workDate, r.workDate], perHour).sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}
