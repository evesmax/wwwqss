export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

type T = { key: string; title: string };
const wrap = (body: string) =>
  `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222">${body}<hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="font-size:12px;color:#888">QSoftware Solutions · Soporte</p></div>`;

export function ackEmail(t: T, portalUrl: string) {
  return {
    subject: `[${t.key}] Recibimos tu solicitud`,
    html: wrap(`<h2>Recibimos tu solicitud</h2><p>Tu ticket <b>${escapeHtml(t.key)}</b> fue registrado: <i>${escapeHtml(t.title)}</i>.</p><p>Te responderemos por este medio y puedes seguirlo en <a href="${escapeHtml(portalUrl)}">el portal de soporte</a>.</p><p style="font-size:12px;color:#888">Este es un acuse automático; no cuenta como primera respuesta del equipo.</p>`),
  };
}
export function commentEmail(t: T, body: string, portalUrl: string) {
  return {
    subject: `[${t.key}] Nueva respuesta: ${t.title}`,
    html: wrap(`<h2>Nueva respuesta en ${escapeHtml(t.key)}</h2><blockquote style="border-left:3px solid #00aeef;margin:0;padding:8px 12px;white-space:pre-wrap">${escapeHtml(body)}</blockquote><p><a href="${escapeHtml(portalUrl)}">Ver y responder en el portal</a></p>`),
  };
}
export const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo", triage: "En triage", in_progress: "En progreso", waiting_customer: "Esperando tu respuesta",
  waiting_third_party: "Esperando a un tercero", resolved: "Resuelto", closed: "Cerrado", duplicate: "Duplicado",
  cancelled: "Cancelado", rejected: "Rechazado", requested: "Solicitado", in_review: "En revisión", quoted: "Cotizado",
  approved: "Aprobado", planned: "Planificado", in_development: "En desarrollo", in_testing: "En pruebas",
  released: "Liberado", deferred: "Diferido", blocked: "Bloqueado",
};
export function statusEmail(t: T, status: string, portalUrl: string) {
  return {
    subject: `[${t.key}] Estado: ${STATUS_LABEL[status] ?? status}`,
    html: wrap(`<h2>${escapeHtml(t.key)} cambió de estado</h2><p>Nuevo estado: <b>${escapeHtml(STATUS_LABEL[status] ?? status)}</b></p><p><a href="${escapeHtml(portalUrl)}">Ver en el portal</a></p>`),
  };
}
export function magicLinkEmail(url: string) {
  return {
    subject: "Tu acceso al portal de soporte QSS",
    html: wrap(`<h2>Acceso al portal de soporte</h2><p>Haz clic para entrar (válido 15 minutos, un solo uso):</p><p><a href="${escapeHtml(url)}" style="background:#00aeef;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Entrar al portal</a></p><p style="font-size:12px;color:#888">Si no lo solicitaste, ignora este correo.</p>`),
  };
}

export const METRIC_LABEL: Record<string, string> = { first_response: "Primera respuesta", update: "Actualización periódica", resolution: "Resolución" };
export function slaAlertEmail(t: T & { severity?: string | null }, metric: string, threshold: number, adminUrl: string) {
  const label = METRIC_LABEL[metric] ?? metric;
  const head = threshold >= 100 ? `SLA vencido` : `SLA al ${threshold}%`;
  return {
    subject: `[${t.key}] ${head} · ${label}`,
    html: wrap(`<h2>${escapeHtml(head)}: ${escapeHtml(label)}</h2><p>Ticket <b>${escapeHtml(t.key)}</b>${t.severity ? ` (${escapeHtml(t.severity)})` : ""}: <i>${escapeHtml(t.title)}</i></p><p><a href="${escapeHtml(adminUrl)}">Abrir ticket</a></p>`),
  };
}
