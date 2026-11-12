export const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo", triage: "Triage", in_progress: "En progreso", waiting_customer: "Esperando cliente",
  waiting_third_party: "Esperando tercero", resolved: "Resuelto", closed: "Cerrado", duplicate: "Duplicado",
  cancelled: "Cancelado", rejected: "Rechazado", requested: "Solicitado", in_review: "En revisión", quoted: "Cotizado",
  approved: "Aprobado", planned: "Planificado", in_development: "En desarrollo", in_testing: "En pruebas",
  released: "Liberado", deferred: "Diferido", blocked: "Bloqueado",
};
export const TYPE_LABEL: Record<string, string> = {
  incident: "Incidente", service_request: "Solicitud de servicio", feature_request: "Nueva función", question: "Consulta", internal_task: "Tarea interna",
};
export const SEV_COLOR: Record<string, string> = { P0: "bg-red-600 text-white", P1: "bg-orange-500 text-white", P2: "bg-yellow-400 text-gray-900", P3: "bg-gray-200 text-gray-700" };
export const fmt = (d?: string | null) => (d ? new Date(d.endsWith("Z") ? d : d + "Z").toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—");

export const CHANNEL_LABEL: Record<string, string> = { manual: "Manual", email: "Correo", api: "API", portal: "Portal", widget: "Widget" };
export const EVENT_TEXT: Record<string, (d: any) => string> = {
  created: (d) => `Ticket creado (${d.channel})`,
  status_changed: (d) => `Estado: ${STATUS_LABEL[d.from] ?? d.from} → ${STATUS_LABEL[d.to] ?? d.to}${d.reason ? ` — ${d.reason}` : ""}`,
  first_response: () => "Primera respuesta pública",
  time_logged: (d) => `Horas registradas: ${d.minutes} min`,
  fields_changed: (d) => `Campos cambiados: ${Object.keys(d.changed ?? {}).join(", ")}`,
  attachment: (d) => `Adjunto: ${d.filename}`,
  sla_excluded: (d) => `Excluido del SLA: ${d.reason}${d.note ? ` — ${d.note}` : ""}`,
  sla_exclusion_removed: () => "Exclusión de SLA retirada",
};

// apiRequest throws "<status>: <body>"; show the server's own message when it sent one (409 guards explain what to do).
export const errMessage = (e: any, fallback: string) => {
  const m = String(e?.message ?? "");
  if (m.startsWith("403")) return "No tienes permiso para esta acción.";
  try { return JSON.parse(m.replace(/^\d+: /, "")).message ?? fallback; } catch { return fallback; }
};

export const STATUS_COLOR: Record<string, string> = {
  new: "bg-sky-100 text-sky-800", triage: "bg-violet-100 text-violet-800", in_progress: "bg-indigo-100 text-indigo-800",
  waiting_customer: "bg-amber-100 text-amber-800", waiting_third_party: "bg-amber-100 text-amber-800", blocked: "bg-red-100 text-red-800",
  resolved: "bg-green-100 text-green-800", closed: "bg-gray-200 text-gray-700", released: "bg-green-100 text-green-800",
};
// "hace 3 h", "hace 2 d": quick age reading for lists (exact dates stay in the tooltip).
export const ago = (d?: string | null, now = Date.now()) => {
  if (!d) return "—";
  const m = Math.max(0, Math.round((now - new Date(d.endsWith("Z") ? d : d + "Z").getTime()) / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  if (m < 60 * 24) return `hace ${Math.floor(m / 60)} h`;
  if (m < 60 * 24 * 30) return `hace ${Math.floor(m / 1440)} d`;
  return `hace ${Math.floor(m / 43200)} mes${Math.floor(m / 43200) > 1 ? "es" : ""}`;
};
