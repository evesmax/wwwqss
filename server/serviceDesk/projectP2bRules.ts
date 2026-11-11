// Pure rules for change control (RF-PRJ-10), status cuts (RF-PRJ-14) and the schedule importer (RF-PRJ-18).
import { businessDaysBetween } from "./projectRules";
import { parseCsv } from "./importRules";
import { escapeHtml } from "./emailTemplates";

const toUtc = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toUtc(s));

// ---------- change control ----------
export function validateChange(c: { title: string; hoursImpact: number; costImpact: number; daysImpact: number }): { ok: true } | { ok: false; error: string } {
  if ((c.title ?? "").trim().length < 3) return { ok: false, error: "Indica el título del cambio" };
  if (!(c.hoursImpact >= 0)) return { ok: false, error: "El impacto en horas no puede ser negativo" };
  if (!(c.costImpact >= 0)) return { ok: false, error: "El costo no puede ser negativo" };
  if (!Number.isInteger(c.daysImpact) || c.daysImpact < 0) return { ok: false, error: "El impacto en días debe ser un entero ≥ 0" };
  return { ok: true };
}
const NEXT: Record<string, Record<string, string>> = { draft: { propose: "proposed" }, proposed: { approve: "approved", reject: "rejected" }, approved: { apply: "applied" } };
export const changeNext = (status: string, action: string): string | null => NEXT[status]?.[action] ?? null;

// ---------- status cuts ----------
// Most recent date, on or before `today`, whose weekday (0=Sun..6=Sat) is `weekday`.
export function lastCutDate(today: string, weekday: number): string {
  const dow = new Date(toUtc(today)).getUTCDay();
  return fromUtc(toUtc(today) - ((dow - weekday + 7) % 7) * DAY);
}
export type CutInput = {
  asOf: string; project: { name: string; status: string };
  progress: { actual: number; planned: number; status: string };
  gates: { code: string; name: string; date: string; status: string }[];
  blocked: { code: string; name: string }[]; docsOverdue: { code: string; name: string; dueDate: string }[];
  decisions: { code: string; question: string; deadline: string; state: string; defaultDecision: string }[];
  risks: { code: string; title: string; level: string }[];
  payments: { name: string; dueDate: string; status: string; amount: string; currency: string }[];
};
// Immutable, customer-safe snapshot: only what the customer is allowed to see (no hours, internal notes or internal risks).
export function buildCut(i: CutInput, horizonDays = 45) {
  const limit = fromUtc(toUtc(i.asOf) + horizonDays * DAY);
  return {
    version: 1, asOf: i.asOf, project: i.project, progress: i.progress,
    nextGates: i.gates.filter((g) => g.status !== "signed" && g.date <= limit).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 5),
    blocked: i.blocked, docsOverdue: i.docsOverdue,
    decisionsPending: i.decisions.filter((d) => d.state !== "decided").map((d) => ({ code: d.code, question: d.question, deadline: d.deadline, defaultDecision: d.defaultDecision, expired: d.state === "expired" })),
    risks: i.risks, payments: i.payments,
  };
}
export type Cut = ReturnType<typeof buildCut>;
const ST: Record<string, [string, string]> = { on_track: ["En tiempo", "#1b7f3b"], at_risk: ["En riesgo", "#b7791f"], late: ["Atrasado", "#c53030"] };
export function renderCutHtml(c: Cut, o: { logoUrl: string; portalUrl: string }): string {
  const e = escapeHtml;
  const [stLabel, stColor] = ST[c.progress.status] ?? ["—", "#667"];
  const h2 = (t: string) => `<h2 style="font-size:15px;margin:22px 0 6px;color:#0b3b5b">${t}</h2>`;
  const li = (xs: string[], empty: string) => (xs.length ? `<ul style="margin:4px 0 0 18px;padding:0;font-size:13px">${xs.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p style="font-size:13px;color:#667;margin:4px 0">${empty}</p>`);
  return `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#1c2733">
${o.logoUrl ? `<img src="${e(o.logoUrl)}" alt="QSS" style="height:36px">` : ""}
<h1 style="font-size:19px;margin:12px 0 2px">${e(c.project.name)}</h1>
<p style="font-size:12px;color:#667;margin:0">Corte de estatus al ${e(c.asOf)}</p>
<p style="font-size:14px;margin:12px 0"><b style="color:${stColor}">${e(stLabel)}</b> · Avance real <b>${c.progress.actual}%</b> frente a <b>${c.progress.planned}%</b> planeado</p>
${h2("Próximos gates")}${li(c.nextGates.map((g) => `${e(g.code)} · ${e(g.name)} — ${e(g.date)}`), "Sin gates en los próximos 45 días.")}
${h2("Actividades bloqueadas por información del cliente")}${li(c.blocked.map((b) => `${e(b.code)} ${e(b.name)}`), "Ninguna.")}
${h2("Documentos vencidos")}${li(c.docsOverdue.map((d) => `${e(d.code)} · ${e(d.name)} (vencía el ${e(d.dueDate)})`), "Ninguno.")}
${h2("Decisiones pendientes")}${li(c.decisionsPending.map((d) => `${e(d.code)} · ${e(d.question)} — límite ${e(d.deadline)}${d.expired ? " (vencida)" : ""}; por defecto: ${e(d.defaultDecision)}`), "Ninguna.")}
${h2("Riesgos compartidos")}${li(c.risks.map((r) => `${e(r.code)} · ${e(r.title)} (${e(r.level)})`), "Ninguno.")}
${c.payments.length ? `${h2("Plan de pagos")}${li(c.payments.map((p) => `${e(p.name)} · ${e(Number(p.amount).toLocaleString("es-MX"))} ${e(p.currency)} · ${e(p.dueDate)} — ${e(p.status)}`), "")}` : ""}
${o.portalUrl ? `<p style="margin-top:22px;font-size:13px"><a href="${e(o.portalUrl)}">Ver el proyecto completo en el portal</a></p>` : ""}
</div>`;
}

// ---------- schedule importer ----------
export type ImportRefs = { doc: string[]; decision: string[]; risk: string[]; module: string[] };
export type ImportedTask = { code: string; name: string; phaseCode: string; assignee: string; start: string; end: string; days: number; pct: number; notes: string; clientSide: boolean; refs: ImportRefs; line: number };
const refsOf = (s: string): ImportRefs => {
  const grab = (re: RegExp) => Array.from(new Set((s.match(re) ?? []).map((x) => x.toUpperCase())));
  return { doc: grab(/\bDOC-\d+\b/gi), decision: grab(/\bP-\d+\b/gi), risk: grab(/\bR-\d+\b/gi), module: grab(/\bMOD-\d+\b/gi) };
};
const CLIENT_WORDS = ["cliente", "customer", "client"];
const HEAD_ALIASES: Record<string, string[]> = {
  tipo: ["tipo", "type"], codigo: ["codigo", "código", "eap", "code"], nombre: ["nombre", "actividad", "name"], fase: ["fase", "phase"], responsable: ["responsable", "owner"],
  inicio: ["inicio", "start"], fin: ["fin", "end"], avance: ["avance", "%", "progress"], notas: ["notas", "notes"], monto: ["monto", "amount"], fecha: ["fecha", "date"],
};
// One CSV with typed rows (FASE, TAREA, PAGO, FERIADO). Never throws: problems are reported per line so a human reviews the draft.
export function parseScheduleCsv(text: string, holidays: Set<string>) {
  const out = { phases: [] as { code: string; name: string }[], tasks: [] as ImportedTask[], payments: [] as { name: string; amount: number; dueDate: string; line: number }[], gates: [] as { code: string; name: string; phaseCode: string; date: string; line: number }[], holidays: [] as string[], errors: [] as { line: number; message: string }[] };
  if (!text.trim()) { out.errors.push({ line: 1, message: "El archivo está vacío" }); return out; }
  const csv = parseCsv(text);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const col: Record<string, string> = {};
  for (const [k, aliases] of Object.entries(HEAD_ALIASES)) { const h = csv.headers.find((x) => aliases.map(norm).includes(norm(x))); if (h) col[k] = h; }
  for (const need of ["tipo", "nombre"]) if (!col[need]) { out.errors.push({ line: 1, message: `Falta la columna «${need}»` }); return out; }
  const g = (r: Record<string, string>, k: string) => (col[k] ? (r[col[k]] ?? "").trim() : "");
  csv.rows.forEach((r, idx) => {
    const line = idx + 2, kind = norm(g(r, "tipo"));
    const err = (message: string) => out.errors.push({ line, message });
    if (kind === "fase") { out.phases.push({ code: g(r, "codigo") || `F${out.phases.length}`, name: g(r, "nombre") }); return; }
    if (kind === "feriado") { const d = g(r, "inicio") || g(r, "fecha"); if (isDate(d)) out.holidays.push(d); else err("Feriado sin fecha válida (AAAA-MM-DD)"); return; }
    if (kind === "gate") {
      const d = g(r, "fecha") || g(r, "inicio"), phaseCode = g(r, "fase");
      if (!isDate(d)) return err("Gate sin fecha válida (AAAA-MM-DD)");
      if (phaseCode && !out.phases.some((p) => p.code === phaseCode)) return err(`La fase «${phaseCode}» no está definida antes del gate`);
      out.gates.push({ code: g(r, "codigo") || `G${out.gates.length}`, name: g(r, "nombre"), phaseCode, date: d, line }); return;
    }
    if (kind === "pago") {
      const amount = Number(g(r, "monto").replace(/[$,\s]/g, "")), due = g(r, "fecha");
      if (!(amount >= 0) || g(r, "monto") === "" || isNaN(amount)) return err("Pago con monto inválido");
      if (!isDate(due)) return err("Pago sin fecha comprometida válida (AAAA-MM-DD)");
      out.payments.push({ name: g(r, "nombre"), amount, dueDate: due, line }); return;
    }
    if (kind === "tarea") {
      const start = g(r, "inicio"), end = g(r, "fin"), phaseCode = g(r, "fase");
      if (!isDate(start) || !isDate(end)) return err("Tarea sin fechas de inicio y fin válidas (AAAA-MM-DD)");
      if (end < start) return err("La fecha fin es anterior al inicio");
      if (phaseCode && !out.phases.some((p) => p.code === phaseCode)) return err(`La fase «${phaseCode}» no está definida antes de la tarea`);
      const pct = Math.max(0, Math.min(100, Math.round(Number(g(r, "avance").replace("%", "")) || 0)));
      const owner = g(r, "responsable");
      out.tasks.push({ code: g(r, "codigo"), name: g(r, "nombre"), phaseCode, assignee: owner, start, end, days: Math.max(1, businessDaysBetween(start, end, holidays)), pct, notes: g(r, "notas"), clientSide: CLIENT_WORDS.includes(norm(owner)), refs: refsOf(g(r, "notas")), line });
      return;
    }
    err(`Tipo de fila desconocido «${g(r, "tipo")}» (usa FASE, TAREA, GATE, PAGO o FERIADO)`);
  });
  return out;
}

// CSV of the schedule (RF-PRJ-12 export). `client` view never includes hours or internal assignees. Guards against spreadsheet formula injection.
export function scheduleCsv(v: { tasks: any[]; phases: any[] }, client: boolean): string {
  const cell = (x: unknown) => { let s = x == null ? "" : String(x); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const head = client ? ["EAP", "Actividad", "Fase", "Responsable", "Inicio", "Fin", "Avance %"] : ["EAP", "Actividad", "Fase", "Responsable", "Inicio", "Fin", "Días", "Horas", "Avance %"];
  const ph = new Map<number, string>(v.phases.map((p: any) => [p.id, p.name]));
  const rows = v.tasks.map((t: any) => {
    const common = [t.code, t.name, ph.get(t.phaseId) ?? "", client ? (t.owner === "cliente" ? "Cliente" : "QSS") : (t.clientSide ? "Cliente" : t.assigneeUserId ? `#${t.assigneeUserId}` : "")];
    const dates = [t.start ?? t.startDate, t.end ?? t.endDate];
    return (client ? [...common, ...dates, t.pct] : [...common, ...dates, t.days, t.hours ?? "", t.pct]).map(cell).join(",");
  });
  return "\ufeff" + [head.map(cell).join(","), ...rows].join("\r\n");
}
