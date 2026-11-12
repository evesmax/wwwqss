// Builds one markdown block with everything needed to reproduce and fix a ticket, meant to be pasted into Claude (or any engineer).
// Pure: no I/O, no React. Screenshots cannot travel inside text, so they are listed and copied to the clipboard separately.
import { STATUS_LABEL, TYPE_LABEL, CHANNEL_LABEL, EVENT_TEXT } from "./ticketUi";

export type TicketContextInput = {
  ticket: Record<string, any>;
  requester?: { name?: string | null; email?: string | null } | null;
  account?: { cliente?: string | null; prefix?: string | null } | null;
  instance?: { name?: string | null; environment?: string | null; baseUrl?: string | null } | null;
  product?: { code?: string | null; name?: string | null } | null;
  events?: { kind: string; at: string; detail?: any; actorType?: string }[];
  comments?: { visibility: string; authorType: string; body: string; createdAt: string }[];
  time?: { workDate?: string; minutes: number; billable?: boolean; note?: string }[];
  attachments?: { id?: number; filename: string; mime?: string; size?: number; visibility?: string }[];
};

const MAX_TEXT = 12_000;
const MAX_CONSOLE_ERRORS = 15;
const when = (d?: string | null) => (d ? new Date(d.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(d) ? d : d + "Z").toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }) : "");
const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n[… texto recortado: ${s.length - MAX_TEXT} caracteres más]` : s);
const kb = (n?: number) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : "");

export function buildTicketContext(d: TicketContextInput, opts: { includeInternal?: boolean } = {}): string {
  const includeInternal = opts.includeInternal !== false;
  const t = d.ticket ?? {};
  const out: string[] = [];
  const line = (label: string, value?: string | number | null) => { if (value !== undefined && value !== null && String(value).trim() !== "") out.push(`- ${label}: ${value}`); };

  out.push(`# ${t.key ?? "Ticket"} — ${t.title ?? ""}`.trim(), "");
  line("Cliente", d.account?.cliente);
  line("Tipo", TYPE_LABEL[t.type] ?? t.type);
  line("Estado", STATUS_LABEL[t.status] ?? t.status);
  line("Severidad", t.severity ?? (t.perceivedSeverity ? `${t.perceivedSeverity} (propuesta por el cliente, sin triage)` : ""));
  line("Prioridad interna", t.priorityInternal);
  line("Canal", CHANNEL_LABEL[t.channel] ?? t.channel);
  line("Entorno", t.environment === "prod" ? "Producción" : t.environment === "stg" ? "Staging" : t.environment);
  line("Producto", d.product ? [d.product.name, d.product.code && d.product.code !== d.product.name ? `(${d.product.code})` : ""].filter(Boolean).join(" ") : "");
  line("Instancia / tenant", d.instance ? [d.instance.name, d.instance.baseUrl ? `— ${d.instance.baseUrl}` : ""].filter(Boolean).join(" ") : "");
  line("Módulo", t.moduleArea);
  line("Solicitante", d.requester ? [d.requester.name, d.requester.email ? `<${d.requester.email}>` : ""].filter(Boolean).join(" ") : "");
  line("Recibido", when(t.receivedAt ?? t.createdAt));
  line("Actualizado", when(t.updatedAt));

  if (t.description) out.push("", "## Descripción", clip(String(t.description)));

  const c = (t.context ?? {}) as Record<string, any>;
  const errors: string[] = Array.isArray(c.consoleErrors) ? c.consoleErrors.filter((x: unknown) => typeof x === "string" && x.trim()) : [];
  if (c.url || c.userAgent || c.appVersion || c.viewport || c.locale || c.sdkUser || errors.length) {
    out.push("", "## Contexto técnico (capturado por el widget)");
    line("URL", c.url); line("Navegador", c.userAgent); line("Versión de la app", c.appVersion);
    line("Pantalla", c.viewport); line("Idioma", c.locale); line("Usuario en la app", c.sdkUser);
    if (errors.length) {
      const last = errors.slice(-MAX_CONSOLE_ERRORS);
      out.push("", `### Errores de consola${errors.length > last.length ? ` (últimos ${last.length} de ${errors.length})` : ""}`, "```", last.join("\n---\n"), "```");
    }
  }

  const events = (d.events ?? []).filter((e) => e.kind !== "comment");
  if (events.length) {
    out.push("", "## Historial");
    for (const e of events) out.push(`- ${when(e.at)} · ${(EVENT_TEXT[e.kind] ?? (() => e.kind))(e.detail ?? {})}`);
  }

  const comments = (d.comments ?? []).filter((x) => includeInternal || x.visibility !== "internal");
  if (comments.length) {
    out.push("", "## Conversación");
    for (const x of comments) {
      const who = x.visibility === "internal" ? "Nota interna (no visible al cliente)" : x.authorType === "contact" ? "Cliente" : "Equipo";
      out.push(`**${when(x.createdAt)} · ${who}**`, clip(x.body), "");
    }
  }

  const time = d.time ?? [];
  if (time.length) {
    out.push("", "## Horas registradas");
    for (const e of time) out.push(`- ${[e.workDate, `${e.minutes} min`, e.billable === false ? "no facturable" : "", e.note].filter(Boolean).join(" · ")}`);
  }

  const atts = (d.attachments ?? []).filter((a) => includeInternal || a.visibility !== "internal");
  if (atts.length) {
    out.push("", "## Adjuntos");
    for (const a of atts) {
      const isImg = (a.mime ?? "").startsWith("image/");
      out.push(`- ${a.filename}${[a.mime, kb(a.size)].filter(Boolean).length ? ` (${[a.mime, kb(a.size)].filter(Boolean).join(", ")})` : ""}${isImg ? " — imagen: se copia aparte, pégala junto con este texto" : ""}`);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
