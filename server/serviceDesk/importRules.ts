// Pure CSV import rules (RF-ADM-05): parsing, mapping to the unified ticket machine, data-quality flags. No I/O.
export type Csv = { headers: string[]; rows: Record<string, string>[] };

export function parseCsv(input: string): Csv {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => firstLine.split(c).length - 1;
  const delim = count(";") > count(",") && count(";") >= count("\t") ? ";" : count("\t") > count(",") ? "\t" : ",";
  const table: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); table.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); table.push(row); }
  const headers = (table.shift() ?? []).map((h) => h.trim());
  const rows = table.filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { if (h && !(h in o)) o[h] = (r[i] ?? "").trim(); });
    return o;
  });
  return { headers, rows };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function mapStatus(raw: string): string | null {
  const s = norm(raw);
  if (!s) return null;
  if (/cancel/.test(s)) return "cancelled";
  if (/rechaz|reject/.test(s)) return "rejected";
  if (/duplic/.test(s)) return "duplicate";
  if (/esperando (al )?cliente|pendiente (de )?cliente|waiting.*customer|customer/.test(s)) return "waiting_customer";
  if (/esperando|tercero|proveedor|waiting|on hold|detenid/.test(s)) return "waiting_third_party";
  if (/cerrad|closed|done|finaliz|completad|terminad|entregad/.test(s)) return "closed";
  if (/resuelt|resolved|solucionad/.test(s)) return "resolved";
  if (/triage|clasific/.test(s)) return "triage";
  if (/proceso|progres|desarroll|atend|working|revision|prueba|testing|asignad/.test(s)) return "in_progress";
  if (/abiert|nuev|new|open|pendiente|por hacer|backlog|to ?do/.test(s)) return "new";
  return null;
}
export function mapSeverity(raw: string): "P0" | "P1" | "P2" | "P3" | null {
  const s = norm(raw);
  const m = s.match(/^p\s?([0-3])$/);
  if (m) return `P${m[1]}` as any;
  if (/critic|urgent|alta|high|grave/.test(s)) return "P1";
  if (/media|medium|normal|moderad/.test(s)) return "P2";
  if (/baja|low|menor|minor/.test(s)) return "P3";
  return null;
}
export function mapType(raw: string): string | null {
  const s = norm(raw);
  if (/incident|bug|falla|error|defecto/.test(s)) return "incident";
  if (/mejora|funcion|feature|nueva|enhancement/.test(s)) return "feature_request";
  if (/consulta|pregunta|duda|question/.test(s)) return "question";
  if (/solicitud|requerimiento|request|servicio/.test(s)) return "service_request";
  return null;
}

const MX_OFFSET = "-06:00"; // Mexico City, fixed offset (no DST since 2022)
export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let iso: string | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/))) {
    const [, y, mo, d, h = "00", mi = "00", sec = "00", tz] = m;
    iso = `${y}-${mo}-${d}T${h}:${mi}:${sec}${tz ? (tz === "Z" ? "Z" : tz.length === 5 ? `${tz.slice(0, 3)}:${tz.slice(3)}` : tz) : MX_OFFSET}`;
  } else if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
    const [, d, mo, y, h = "0", mi = "00", sec = "00"] = m;
    iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${sec}${MX_OFFSET}`;
  }
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(+d)) return null;
  // Reject rolled-over dates such as 31/02.
  const dayPart = iso.slice(0, 10);
  const local = new Date(+d + (iso.endsWith("Z") ? 0 : -6 * 3600_000)).toISOString().slice(0, 10);
  if (!iso.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(iso.replace(MX_OFFSET, "")) && local !== dayPart) return null;
  return d;
}

export type Field = "externalRef" | "title" | "description" | "type" | "severity" | "status" | "createdAt" | "resolvedAt" | "hours" | "requester";
export type Mapping = Partial<Record<Field, string>>;
const GUESS: Record<Field, RegExp> = {
  externalRef: /^(folio|id|ticket|no\.?|numero|#|clave|key)$/,
  title: /^(titulo|asunto|resumen|summary|title|subject|incidencia|nombre)$/,
  description: /^(descripcion|detalle|description|detail|comentarios?)$/,
  type: /^(tipo|type|categoria)$/,
  severity: /^(prioridad|severidad|priority|severity)$/,
  status: /^(estatus|estado|status)$/,
  createdAt: /^(fecha( de)?( reporte| creacion| alta| solicitud| apertura)?|reportado|creado|created( at)?|fecha reportada)$/,
  resolvedAt: /^(fecha( de)?( resolucion| cierre| solucion| termino| entrega)|resuelto|cerrado|resolved( at)?|closed( at)?)$/,
  hours: /^(horas|hrs|tiempo|hours|esfuerzo)$/,
  requester: /^(solicitante|reporto|reportado por|contacto|requester|usuario|cliente)$/,
};
export function suggestMapping(headers: string[]): Mapping {
  const out: Mapping = {};
  const used = new Set<string>();
  for (const f of Object.keys(GUESS) as Field[]) {
    const h = headers.find((x) => !used.has(x) && GUESS[f].test(norm(x)));
    if (h) { out[f] = h; used.add(h); }
  }
  return out;
}

export type ImportRow = {
  line: number; externalRef: string | null; title: string; description: string; type: string; severity: string | null; perceivedSeverity: string | null;
  status: string; createdAt: Date | null; resolvedAt: Date | null; closedAt: Date | null; hours: number | null; requester: string | null;
  flags: string[]; skip?: string;
};
export const FLAG_LABEL: Record<string, string> = {
  unknown_status: "Estado no reconocido (se importó como Nuevo)", missing_created_at: "Sin fecha de reporte (se usó la fecha de importación)",
  missing_resolved_at: "Resuelto/cerrado sin fecha de resolución", resolved_before_created: "Resolución anterior al reporte",
  unknown_severity: "Prioridad no reconocida", bad_hours: "Horas no numéricas",
};
const FEATURE_STATUS: Record<string, string> = { new: "requested", triage: "in_review", in_progress: "in_development", waiting_customer: "in_review", waiting_third_party: "blocked", resolved: "released", closed: "closed", cancelled: "rejected", duplicate: "rejected", rejected: "rejected" };

export function buildImportRows(records: Record<string, string>[], map: Mapping, defaults: { type?: string } = {}) {
  const get = (r: Record<string, string>, f: Field) => (map[f] ? (r[map[f]!] ?? "").trim() : "");
  const seen = new Set<string>();
  const rows: ImportRow[] = records.map((r, i) => {
    const flags: string[] = [];
    const title = get(r, "title").slice(0, 200);
    const ref = get(r, "externalRef") || null;
    const type = (map.type && mapType(get(r, "type"))) || defaults.type || "incident";
    const rawSev = get(r, "severity");
    const sev = rawSev ? mapSeverity(rawSev) : null;
    if (rawSev && !sev) flags.push("unknown_severity");
    const rawStatus = get(r, "status");
    let status = mapStatus(rawStatus);
    if (!status) { status = "new"; if (map.status) flags.push("unknown_status"); }
    if (type === "feature_request") status = FEATURE_STATUS[status] ?? "requested";
    const createdAt = map.createdAt ? parseDate(get(r, "createdAt")) : null;
    if (!createdAt) flags.push("missing_created_at");
    const resolvedAt = map.resolvedAt ? parseDate(get(r, "resolvedAt")) : null;
    const done = ["resolved", "closed", "released"].includes(status);
    if (done && !resolvedAt) flags.push("missing_resolved_at");
    if (createdAt && resolvedAt && resolvedAt < createdAt) flags.push("resolved_before_created");
    let hours: number | null = null;
    const rawH = get(r, "hours");
    if (rawH) { const n = Number(rawH.replace(",", ".")); if (isFinite(n) && n >= 0 && n <= 10000) hours = n; else flags.push("bad_hours"); }
    const row: ImportRow = {
      line: i + 2, externalRef: ref, title, description: get(r, "description").slice(0, 20000), type,
      severity: type === "incident" && sev && sev !== "P0" ? sev : null, // P0 needs the guided questionnaire: imported P0 stays "perceived"
      perceivedSeverity: sev, status, createdAt, resolvedAt, closedAt: status === "closed" ? resolvedAt : null,
      hours, requester: get(r, "requester") || null, flags,
    };
    if (!title) row.skip = "Sin título";
    else if (ref) { if (seen.has(ref)) row.skip = "Folio repetido en el archivo"; seen.add(ref); }
    return row;
  });
  const skipped = rows.filter((x) => x.skip).length;
  return { rows, summary: { total: rows.length, importable: rows.length - skipped, skipped, flagged: rows.filter((x) => !x.skip && x.flags.length).length } };
}
