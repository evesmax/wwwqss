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
