// Dashboard transversal de tickets: volumen, urgencia por SLA, repetitivos y desempeño de resolución.
import type { Express, RequestHandler } from "express";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { visibleAccountIds } from "./access";
import { wrap } from "./httpUtil";

const CLOSED = sql`('resolved','closed','duplicate','cancelled','rejected','released','deferred')`;
const q = z.object({ days: z.coerce.number().int().min(7).max(365).default(90), accountId: z.coerce.number().int().positive().optional(), productId: z.coerce.number().int().positive().optional() });
const rows = async (s: SQL) => ((await db.execute(s)) as any).rows as any[];
const num = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);

export const normTitle = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function registerStatsRoutes(app: Express, auth: RequestHandler[]) {
  app.get("/api/desk/tickets/stats", ...auth, wrap(async (req, res) => {
    const p = q.parse(req.query);
    let ids = await visibleAccountIds((req as any).actor);
    if (p.accountId) ids = ids.filter((i) => i === p.accountId);
    const empty = { days: p.days, kpis: {}, byProduct: [], byAccount: [], byStatus: [], bySeverity: [], timeline: [], urgent: [], repeatedModules: [], repeatedTitles: [], resolutionBySeverity: [], byAssignee: [], aging: [] };
    if (!ids.length) return res.json(empty);
    const scope = sql`t.account_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})${p.productId ? sql` and t.product_id = ${p.productId}` : sql``}`;
    const since = sql`now() - (${p.days} || ' days')::interval`;
    const inPeriod = sql`t.created_at >= ${since}`;
    const open = sql`t.status not in ${CLOSED}`;

    const [kpis] = await rows(sql`
      select count(*) filter (where ${inPeriod})::int as created,
             count(*) filter (where t.resolved_at >= ${since})::int as resolved,
             count(*) filter (where ${open})::int as open_now,
             count(*) filter (where ${open} and t.severity in ('P0','P1'))::int as critical_open,
             avg(extract(epoch from (t.first_response_at - t.created_at))/3600) filter (where ${inPeriod} and t.first_response_at is not null) as avg_first_response_h,
             avg(extract(epoch from (t.resolved_at - t.created_at))/3600) filter (where t.resolved_at >= ${since}) as avg_resolution_h,
             percentile_cont(0.5) within group (order by extract(epoch from (t.resolved_at - t.created_at))/3600) filter (where t.resolved_at >= ${since}) as median_resolution_h
      from sd_tickets t where ${scope}`);
    const [sla] = await rows(sql`
      select count(*) filter (where s.state = 'met')::int as met, count(*) filter (where s.state = 'breached')::int as breached
      from sd_sla_instances s join sd_tickets t on t.id = s.ticket_id where ${scope} and ${inPeriod} and s.state in ('met','breached')`);
    const decided = (sla?.met ?? 0) + (sla?.breached ?? 0);

    const byProduct = await rows(sql`
      select coalesce(p.name, 'Sin producto') as name, count(*)::int as total, count(*) filter (where ${open})::int as open,
             count(*) filter (where t.severity in ('P0','P1'))::int as critical, count(*) filter (where t.type = 'incident')::int as incidents
      from sd_tickets t left join sd_products p on p.id = t.product_id where ${scope} and ${inPeriod} group by 1 order by total desc limit 15`);
    const byAccount = await rows(sql`
      select c.nombre_negocio as name, count(*)::int as total, count(*) filter (where ${open})::int as open
      from sd_tickets t join sd_accounts a on a.id = t.account_id join clientes c on c.id = a.cliente_id where ${scope} and ${inPeriod} group by 1 order by total desc limit 10`);
    const byStatus = await rows(sql`select t.status, count(*)::int as n from sd_tickets t where ${scope} and (${inPeriod} or ${open}) group by 1 order by n desc`);
    const bySeverity = await rows(sql`select coalesce(t.severity, 'none') as severity, count(*)::int as n from sd_tickets t where ${scope} and ${open} group by 1 order by 1`);
    const timeline = await rows(sql`
      with w as (select generate_series(date_trunc('week', ${since}), date_trunc('week', now()), interval '1 week') as wk)
      select to_char(w.wk, 'YYYY-MM-DD') as week,
        (select count(*)::int from sd_tickets t where ${scope} and date_trunc('week', t.created_at) = w.wk) as created,
        (select count(*)::int from sd_tickets t where ${scope} and date_trunc('week', t.resolved_at) = w.wk) as resolved
      from w order by w.wk`);
    // Most urgent by SLA time: open tickets with the least (or most negative) time left on a running clock.
    const urgent = await rows(sql`
      select t.id, t.key, t.title, t.severity, t.status, c.nombre_negocio as account, p.name as product, s.metric, s.state,
             round((s.target_ms::numeric - s.elapsed_ms::numeric)/60000)::bigint as remaining_min, s.due_at
      from sd_sla_instances s join sd_tickets t on t.id = s.ticket_id join sd_accounts a on a.id = t.account_id join clientes c on c.id = a.cliente_id left join sd_products p on p.id = t.product_id
      where ${scope} and ${open} and s.stopped_at is null and s.state in ('running','at_risk','breached') and not s.paused
      order by (s.target_ms::numeric - s.elapsed_ms::numeric) asc limit 15`);
    const repeatedModules = await rows(sql`
      select coalesce(p.name, 'Sin producto') as product, t.module_area as module, count(*)::int as total, count(*) filter (where ${open})::int as open,
             to_char(max(t.created_at), 'YYYY-MM-DD') as last_at
      from sd_tickets t left join sd_products p on p.id = t.product_id where ${scope} and ${inPeriod} and t.type = 'incident' and t.module_area <> ''
      group by 1, 2 having count(*) >= 2 order by total desc limit 10`);
    const titles = await rows(sql`select t.title, t.account_id, t.status, t.created_at from sd_tickets t where ${scope} and ${inPeriod} and t.type = 'incident'`);
    const groups = new Map<string, { title: string; total: number; open: number; accounts: Set<number> }>();
    for (const r of titles) {
      const k = normTitle(r.title); if (k.length < 6) continue;
      const g = groups.get(k) ?? { title: r.title, total: 0, open: 0, accounts: new Set<number>() };
      g.total++; if (!["resolved", "closed", "duplicate", "cancelled", "rejected", "released", "deferred"].includes(r.status)) g.open++; g.accounts.add(r.account_id); groups.set(k, g);
    }
    const repeatedTitles = [...groups.values()].filter((g) => g.total >= 2).sort((a, b) => b.total - a.total).slice(0, 10).map((g) => ({ title: g.title, total: g.total, open: g.open, accounts: g.accounts.size }));
    const resolutionBySeverity = await rows(sql`
      select coalesce(t.severity, 'none') as severity, count(*)::int as n,
             avg(extract(epoch from (t.resolved_at - t.created_at))/3600) as avg_resolution_h,
             avg(extract(epoch from (t.first_response_at - t.created_at))/3600) filter (where t.first_response_at is not null) as avg_first_response_h
      from sd_tickets t where ${scope} and t.resolved_at >= ${since} group by 1 order by 1`);
    const byAssignee = await rows(sql`
      select coalesce(nullif(u.full_name, ''), u.username, 'Sin asignar') as name, count(*) filter (where t.resolved_at >= ${since})::int as resolved, count(*) filter (where ${open})::int as open,
             avg(extract(epoch from (t.resolved_at - t.created_at))/3600) filter (where t.resolved_at >= ${since}) as avg_resolution_h
      from sd_tickets t left join users u on u.id = t.assignee_user_id where ${scope} group by 1 having count(*) filter (where t.resolved_at >= ${since}) + count(*) filter (where ${open}) > 0 order by resolved desc limit 12`);
    const aging = await rows(sql`
      select case when age < 1 then '< 1 día' when age < 3 then '1-3 días' when age < 7 then '3-7 días' when age < 14 then '7-14 días' else '> 14 días' end as bucket, count(*)::int as n,
             min(case when age < 1 then 1 when age < 3 then 2 when age < 7 then 3 when age < 14 then 4 else 5 end) as ord
      from (select extract(epoch from (now() - t.created_at))/86400 as age from sd_tickets t where ${scope} and ${open}) x group by 1 order by ord`);

    res.json({
      days: p.days,
      kpis: {
        created: kpis.created, resolved: kpis.resolved, openNow: kpis.open_now, criticalOpen: kpis.critical_open,
        avgFirstResponseH: num(kpis.avg_first_response_h), avgResolutionH: num(kpis.avg_resolution_h), medianResolutionH: num(kpis.median_resolution_h),
        slaCompliancePct: decided ? Math.round((sla.met / decided) * 1000) / 10 : null, slaDecided: decided,
      },
      byProduct, byAccount, byStatus, bySeverity, timeline, urgent: urgent.map((u) => ({ ...u, remaining_min: Number(u.remaining_min) })),
      repeatedModules, repeatedTitles,
      resolutionBySeverity: resolutionBySeverity.map((r) => ({ ...r, avg_resolution_h: num(r.avg_resolution_h), avg_first_response_h: num(r.avg_first_response_h) })),
      byAssignee: byAssignee.map((r) => ({ ...r, avg_resolution_h: num(r.avg_resolution_h) })),
      aging: aging.map(({ bucket, n }) => ({ bucket, n })),
    });
  }));
}
