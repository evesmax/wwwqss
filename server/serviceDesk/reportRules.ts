// Pure monthly-report builder and HTML renderer (RF-REP-02/03/07). No I/O. Missing data is "N/D", never 100 %.
import { escapeHtml } from "./emailTemplates";

export type MetricSnap = { state: string; elapsedMs: number; stoppedAt: Date | null };
export type ReportTicket = {
  id: number; key: string; title: string; type: string; severity: string | null; status: string; createdAt: Date; resolvedAt: Date | null;
  slaApplicable: boolean; exclusionReason: string | null; reopenedInPeriod: boolean; rcaCause: string | null;
  sla: Partial<Record<"first_response" | "resolution", MetricSnap>>;
};
export type ReportInput = {
  account: string; period: { year: number; month: number; fromMs: number; toMs: number }; generatedAt: Date; tickets: ReportTicket[];
  availability: { name: string; instance: string; pct: number | null; downMinutes: number; maintenanceMinutes: number; coverage: number }[];
  incidents: { title: string; startedAt: Date; resolvedAt: Date | null; impact: string; rca: { cause: string; fix: string; prevention: string } | null }[];
  maintenanceUpcoming: { title: string; startsAt: Date; endsAt: Date }[];
  hoursMinutes: number; hoursBankMinutes: number | null;
  // Module catalog (MOD-xx) and contract lifecycle from the projects module (optional: accounts without a project).
  modules?: { code: string; name: string; status: string; releasedAt: Date | null }[];
  lifecycle?: string | null;
};

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length))) - 1];
}
const r1 = (n: number) => Math.round(n * 10) / 10;
const hrs = (ms: number | null) => (ms == null ? null : r1(ms / 3_600_000));
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const NO_SLA_TYPES = ["internal_task", "feature_request"];
const OPEN_DONE = ["resolved", "closed", "duplicate", "cancelled", "rejected", "released"];
export const KEYS = ["first_response", "resolution"] as const;
const SEVS = ["P0", "P1", "P2", "P3", "sin severidad"];

export function buildReport(i: ReportInput) {
  const { fromMs, toMs } = i.period;
  const inP = (d: Date | null) => !!d && +d >= fromMs && +d < toMs;
  const visible = i.tickets.filter((t) => t.type !== "internal_task");
  const notes: string[] = [];

  // --- SLA ---
  const sla: any = { metrics: {}, exclusions: [], breaches: [], bySeverity: [], withoutTimestamps: 0, compliancePct: null };
  const sample: Record<string, { sev: string; ms: number }[]> = { first_response: [], resolution: [] };
  let met = 0, total = 0;
  const applicable = visible.filter((t) => !NO_SLA_TYPES.includes(t.type));
  for (const k of KEYS) {
    let m = 0, n = 0;
    for (const t of applicable) {
      const s = t.sla[k];
      if (!t.slaApplicable || !s) continue;
      const counted = inP(s.stoppedAt) || (!s.stoppedAt && s.state === "breached");
      if (!counted) continue;
      n++; if (s.state === "met") m++;
      if (s.state === "breached") sla.breaches.push({ key: t.key, title: t.title, metric: k, cause: t.rcaCause ?? "N/D" });
      if (s.stoppedAt) sample[k].push({ sev: t.severity ?? "sin severidad", ms: s.elapsedMs });
    }
    sla.metrics[k] = { met: m, total: n, pct: n ? r1((m / n) * 100) : null };
    met += m; total += n;
  }
  sla.compliancePct = total ? r1((met / total) * 100) : null;
  sla.exclusions = applicable.filter((t) => !t.slaApplicable && t.exclusionReason && t.exclusionReason !== "imported")
    .map((t) => ({ key: t.key, title: t.title, reason: t.exclusionReason }));
  sla.withoutTimestamps = visible.filter((t) => t.exclusionReason === "imported").length;
  sla.bySeverity = SEVS.map((sev) => {
    const g = (k: string) => { const v = sample[k].filter((x) => x.sev === sev).map((x) => x.ms); return { n: v.length, medianHours: hrs(percentile(v, 50)), p90Hours: hrs(percentile(v, 90)) }; };
    return { severity: sev, firstResponse: g("first_response"), resolution: g("resolution") };
  }).filter((x) => x.firstResponse.n || x.resolution.n);
  if (!total) notes.push("No hubo tickets con SLA aplicable en el periodo: el cumplimiento se muestra como N/D (no se asume 100 %).");
  if (sla.withoutTimestamps) notes.push(`${sla.withoutTimestamps} ticket(s) son históricos importados sin marcas de tiempo confiables y no se incluyen en los cálculos de SLA.`);

  // --- tickets ---
  const opened = visible.filter((t) => inP(t.createdAt));
  const closed = visible.filter((t) => inP(t.resolvedAt));
  const byType: Record<string, { opened: number; closed: number }> = {};
  const bump = (list: ReportTicket[], f: "opened" | "closed") => list.forEach((t) => { (byType[t.type] ??= { opened: 0, closed: 0 })[f]++; });
  bump(opened, "opened"); bump(closed, "closed");
  const bySev: Record<string, number> = {};
  opened.forEach((t) => { const s = t.severity ?? "sin severidad"; bySev[s] = (bySev[s] ?? 0) + 1; });
  const backlog = { upTo7: 0, from8to30: 0, over30: 0, total: 0 };
  visible.filter((t) => !OPEN_DONE.includes(t.status) && +t.createdAt < toMs).forEach((t) => {
    const age = (toMs - +t.createdAt) / 86_400_000; backlog.total++;
    if (age <= 7) backlog.upTo7++; else if (age <= 30) backlog.from8to30++; else backlog.over30++;
  });
  const list = visible.filter((t) => inP(t.createdAt) || inP(t.resolvedAt) || (!t.resolvedAt && !OPEN_DONE.includes(t.status) && +t.createdAt < toMs))
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map((t) => ({ key: t.key, title: t.title, type: t.type, severity: t.severity, status: t.status, createdAt: iso(t.createdAt), resolvedAt: iso(t.resolvedAt),
      resolutionHours: t.resolvedAt ? hrs(+t.resolvedAt - +t.createdAt) : null }));

  // --- availability ---
  const pcts = i.availability.map((a) => a.pct).filter((x): x is number => x != null);
  i.availability.filter((a) => a.pct == null).forEach((a) => notes.push(`Sin datos de disponibilidad para ${a.name} (${a.instance}): N/D.`));
  const availability = {
    pct: pcts.length ? Math.round((pcts.reduce((s, x) => s + x, 0) / pcts.length) * 10000) / 10000 : null,
    components: i.availability.map((a) => ({ ...a })),
    incidents: i.incidents.map((x) => ({ title: x.title, impact: x.impact, startedAt: iso(x.startedAt), resolvedAt: iso(x.resolvedAt), rca: x.rca })),
  };
  if (!i.availability.length) notes.push("No hay monitores de disponibilidad configurados para esta cuenta: disponibilidad N/D.");

  // --- features / hours / csat ---
  const feats = visible.filter((t) => t.type === "feature_request");
  const features = {
    delivered: feats.filter((t) => ["released", "closed"].includes(t.status) && inP(t.resolvedAt)).map((t) => ({ key: t.key, title: t.title })),
    inProgress: feats.filter((t) => ["approved", "planned", "in_development", "in_testing", "quoted", "in_review"].includes(t.status)).map((t) => ({ key: t.key, title: t.title, status: t.status })),
  };
  const consumed = r1(i.hoursMinutes / 60), bank = i.hoursBankMinutes == null ? null : r1(i.hoursBankMinutes / 60);
  const hours = { consumedHours: consumed, bankHours: bank, balanceHours: bank == null ? null : r1(bank - consumed) };
  if (bank == null) notes.push("El contrato no define bolsa de horas: saldo N/D.");
  const lc = i.lifecycle ?? null;
  if (lc === "implementation" || lc === "discovery") notes.push("N/A — en implementación: el SLA de soporte aún no corre para este servicio; no se muestra un cumplimiento ficticio.");
  if (lc === "parallel") notes.push("Servicio en periodo paralelo / hypercare: el SLA se mide según la política acordada para esta etapa.");
  const mods = i.modules ?? [];
  const delivery = { lifecycle: lc, modulesReleased: mods.filter((m) => m.status === "released" && inP(m.releasedAt)).map((m) => ({ code: m.code, name: m.name })), modulesInProgress: mods.filter((m) => m.status !== "released").map((m) => ({ code: m.code, name: m.name, status: m.status })) };

  return {
    version: 1, account: i.account, period: { year: i.period.year, month: i.period.month }, generatedAt: i.generatedAt.toISOString(),
    summary: { slaPct: sla.compliancePct, availabilityPct: availability.pct, ticketsClosed: closed.length, hoursConsumed: consumed },
    sla, tickets: { opened: opened.length, closed: closed.length, reopened: visible.filter((t) => t.reopenedInPeriod).length, byType, bySeverity: bySev, backlog, list },
    availability, features, delivery, hours, csat: { value: null as number | null, note: "N/D: la encuesta de satisfacción aún no está habilitada." },
    maintenanceUpcoming: i.maintenanceUpcoming.map((m) => ({ title: m.title, startsAt: iso(m.startsAt), endsAt: iso(m.endsAt) })), notes,
  };
}
export type Report = ReturnType<typeof buildReport>;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const periodLabel = (y: number, m: number) => `${MONTHS[m - 1]} de ${y}`;
const TYPE_LABEL: Record<string, string> = { incident: "Incidente", service_request: "Solicitud", question: "Consulta", feature_request: "Nueva función" };
const STATUS_LABEL: Record<string, string> = { new: "Nuevo", triage: "Triage", in_progress: "En progreso", waiting_customer: "Esperando cliente", waiting_third_party: "Esperando tercero", resolved: "Resuelto", closed: "Cerrado", duplicate: "Duplicado", cancelled: "Cancelado", rejected: "Rechazado" };
const EXCL: Record<string, string> = { third_party_declared: "Tercero declarado", customer_no_info: "Cliente no entregó información", mistyped: "Ticket mal tipificado", force_majeure: "Fuerza mayor" };
const MOD_LABEL: Record<string, string> = { planned: "planeado", in_dev: "en desarrollo", uat: "en UAT", released: "liberado" };
const METRIC: Record<string, string> = { first_response: "Primera respuesta", resolution: "Resolución" };
export const GLOSSARY: [string, string][] = [
  ["Primera respuesta", "Tiempo hábil desde que se reporta el ticket hasta el primer mensaje público de una persona del equipo. Los acuses automáticos no cuentan."],
  ["Resolución", "Tiempo hábil desde el reporte hasta el estado Resuelto. Se pausa mientras esperamos tu respuesta o a un tercero declarado."],
  ["Cumplimiento de SLA", "Metas cumplidas entre metas medidas en el periodo. Si no hubo mediciones se muestra N/D."],
  ["Minuto caído", "Minuto en que el monitor falló desde 2 ubicaciones distintas."],
  ["Disponibilidad", "100 − (minutos caídos ÷ minutos monitoreados), hora de Ciudad de México, excluyendo mantenimientos anunciados con 48 h o más."],
  ["Mediana / P90", "Valor central y valor bajo el cual queda el 90 % de los casos."],
  ["N/D", "No disponible: no existe el dato; nunca se sustituye por 100 %."],
];

export function renderReportHtml(r: Report, o: { logoUrl: string; portalUrl: string }): string {
  const e = escapeHtml;
  const pct = (v: number | null, d = 1) => (v == null ? "N/D" : `${v.toFixed(d)}%`);
  const num = (v: number | null) => (v == null ? "N/D" : String(v));
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" }) : "—");
  const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const th = "text-align:left;padding:6px 8px;background:#f3f6f9;font-size:12px;border-bottom:1px solid #e3e8ee";
  const td = "padding:6px 8px;font-size:12px;border-bottom:1px solid #eef1f5;vertical-align:top";
  const h2 = (t: string) => `<h2 style="font-size:16px;margin:26px 0 8px;color:#0b3b5b">${t}</h2>`;
  const table = (heads: string[], rows: string[][]) => `<table style="border-collapse:collapse;width:100%"><thead><tr>${heads.map((h) => `<th style="${th}">${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((x) => `<tr>${x.map((c) => `<td style="${td}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const kpi = (label: string, value: string) => `<td style="padding:12px;text-align:center;border:1px solid #e3e8ee;border-radius:8px"><div style="font-size:22px;font-weight:700;color:#0b3b5b">${e(value)}</div><div style="font-size:11px;color:#667">${e(label)}</div></td>`;

  const sevRows = r.sla.bySeverity.map((s: any) => [e(s.severity), `${s.firstResponse.n}`, `${num(s.firstResponse.medianHours)} h / ${num(s.firstResponse.p90Hours)} h`, `${s.resolution.n}`, `${num(s.resolution.medianHours)} h / ${num(s.resolution.p90Hours)} h`]);
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:auto;color:#222">
<div style="border-bottom:3px solid #00aeef;padding-bottom:12px;margin-bottom:8px"><img src="${e(o.logoUrl)}" alt="QSoftware Solutions" style="height:40px"><div style="float:right;text-align:right;font-size:12px;color:#667">Informe mensual de servicio<br><b>${e(periodLabel(r.period.year, r.period.month))}</b></div></div>
<h1 style="font-size:20px;margin:14px 0 4px">${e(r.account)}</h1>
<table style="width:100%;border-spacing:8px"><tr>${kpi("Cumplimiento de SLA", pct(r.summary.slaPct))}${kpi("Disponibilidad", pct(r.summary.availabilityPct, 3))}${kpi("Tickets resueltos", String(r.summary.ticketsClosed))}${kpi("Horas consumidas", String(r.summary.hoursConsumed))}</tr></table>
${r.notes.length ? `<div style="background:#fff8e1;border:1px solid #ffe08a;border-radius:8px;padding:10px;font-size:12px;margin:8px 0"><b>Notas sobre los datos</b><ul style="margin:6px 0 0 18px;padding:0">${r.notes.map((n) => `<li>${e(n)}</li>`).join("")}</ul></div>` : ""}
${h2("Cumplimiento de SLA")}
${table(["Meta", "Cumplidas", "Medidas", "%"], (["first_response", "resolution"] as const).map((k) => [e(METRIC[k]), String(r.sla.metrics[k].met), String(r.sla.metrics[k].total), pct(r.sla.metrics[k].pct)]))}
${sevRows.length ? `<p style="font-size:12px;color:#667;margin:10px 0 4px">Por severidad (mediana / P90, horas hábiles)</p>${table(["Severidad", "Resp. n", "Primera respuesta", "Resol. n", "Resolución"], sevRows)}` : ""}
${r.sla.breaches.length ? `<p style="font-size:12px;margin:10px 0 4px"><b>Incumplimientos</b></p>${table(["Ticket", "Meta", "Causa"], r.sla.breaches.map((b: any) => [e(b.key + " · " + b.title), e(METRIC[b.metric]), e(b.cause)]))}` : ""}
${r.sla.exclusions.length ? `<p style="font-size:12px;margin:10px 0 4px"><b>Exclusiones aplicadas</b> (transparencia)</p>${table(["Ticket", "Motivo"], r.sla.exclusions.map((x: any) => [e(x.key + " · " + x.title), e(EXCL[x.reason] ?? x.reason)]))}` : ""}
${h2("Disponibilidad")}
${r.availability.components.length ? table(["Componente", "Instancia", "Disponibilidad", "Minutos caídos", "Mantenimiento"], r.availability.components.map((a: any) => [e(a.name), e(a.instance), pct(a.pct, 3), dur(a.downMinutes), dur(a.maintenanceMinutes)])) : "<p style='font-size:12px'>N/D</p>"}
${r.availability.incidents.length ? `<p style="font-size:12px;margin:10px 0 4px"><b>Incidentes de plataforma</b></p>${table(["Incidente", "Inicio", "Fin", "Causa raíz"], r.availability.incidents.map((x: any) => [e(x.title), date(x.startedAt), date(x.resolvedAt), x.rca ? e(`${x.rca.cause}. Corrección: ${x.rca.fix}. Prevención: ${x.rca.prevention}`) : "N/D"]))}` : ""}
${h2("Tickets del periodo")}
<p style="font-size:12px">Abiertos: <b>${r.tickets.opened}</b> · Resueltos: <b>${r.tickets.closed}</b> · Reabiertos: <b>${r.tickets.reopened}</b> · Pendientes al cierre: <b>${r.tickets.backlog.total}</b> (hasta 7 días: ${r.tickets.backlog.upTo7}, 8–30: ${r.tickets.backlog.from8to30}, más de 30: ${r.tickets.backlog.over30})</p>
${r.tickets.list.length ? table(["Ticket", "Título", "Tipo", "Sev.", "Reporte", "Resolución", "Estado", "Horas"], r.tickets.list.map((t: any) => [e(t.key), e(t.title), e(TYPE_LABEL[t.type] ?? t.type), e(t.severity ?? "—"), date(t.createdAt), date(t.resolvedAt), e(STATUS_LABEL[t.status] ?? t.status), num(t.resolutionHours)])) : "<p style='font-size:12px'>Sin tickets en el periodo.</p>"}
${h2("Funciones nuevas")}
<p style="font-size:12px">Entregadas: ${r.features.delivered.length ? r.features.delivered.map((f: any) => e(f.key + " · " + f.title)).join("; ") : "ninguna"}.<br>En curso: ${r.features.inProgress.length ? r.features.inProgress.map((f: any) => e(f.key + " · " + f.title)).join("; ") : "ninguna"}.</p>
${r.delivery && (r.delivery.modulesReleased.length || r.delivery.modulesInProgress.length) ? `<p style="font-size:12px"><b>Módulos entregados en el periodo:</b> ${r.delivery.modulesReleased.length ? r.delivery.modulesReleased.map((m: any) => e(m.code + " · " + m.name)).join("; ") : "ninguno"}.<br><b>Módulos en curso:</b> ${r.delivery.modulesInProgress.length ? r.delivery.modulesInProgress.map((m: any) => e(m.code + " · " + m.name + " (" + (MOD_LABEL[m.status] ?? m.status) + ")")).join("; ") : "ninguno"}.</p>` : ""}
${h2("Horas")}
<p style="font-size:12px">Consumidas: <b>${r.hours.consumedHours} h</b> · Bolsa contratada: <b>${num(r.hours.bankHours)}${r.hours.bankHours == null ? "" : " h"}</b> · Saldo: <b>${num(r.hours.balanceHours)}${r.hours.balanceHours == null ? "" : " h"}</b></p>
${h2("Satisfacción y mantenimientos")}
<p style="font-size:12px">CSAT: ${e(r.csat.note)}</p>
${r.maintenanceUpcoming.length ? `<p style="font-size:12px">Próximos mantenimientos: ${r.maintenanceUpcoming.map((m: any) => e(`${m.title} (${date(m.startsAt)})`)).join("; ")}</p>` : "<p style='font-size:12px'>Sin mantenimientos programados.</p>"}
<p style="margin:22px 0"><a href="${e(o.portalUrl)}" style="background:#00aeef;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px">Ver detalle en el portal</a></p>
${h2("Glosario")}
<dl style="font-size:11px;color:#555;margin:0">${GLOSSARY.map(([k, v]) => `<dt style="font-weight:700;margin-top:6px">${e(k)}</dt><dd style="margin:0">${e(v)}</dd>`).join("")}</dl>
<hr style="border:none;border-top:1px solid #eee;margin:20px 0"><p style="font-size:11px;color:#888">QSoftware Solutions · Soporte · Generado el ${e(date(r.generatedAt))}. Todas las cifras son calculadas por el sistema a partir de los registros del periodo.</p></div>`;
}
