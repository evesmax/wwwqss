import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, bigserial, unique, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull().default(""),
  avatarUrl: text("avatar_url"),
  active: boolean("active").notNull().default(true),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  module: text("module").notNull().default("general"),
});

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
});

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
});

export const tiposNegocio = pgTable("tipos_negocio", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  tipo: text("tipo").notNull().default("Prospecto"),
  nombreNegocio: text("nombre_negocio").notNull(),
  tipoNegocioId: integer("tipo_negocio_id").references(() => tiposNegocio.id),
  nombreContacto: text("nombre_contacto").notNull().default(""),
  telefonoContacto: text("telefono_contacto").notNull().default(""),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const etapasVenta = pgTable("etapas_venta", {
  id: serial("id").primaryKey(),
  codigoEtapa: text("codigo_etapa").notNull().unique(),
  etapa: text("etapa").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  inicial: boolean("inicial").notNull().default(false),
  final: boolean("final").notNull().default(false),
  probabilidad: integer("probabilidad").notNull().default(0),
  orden: integer("orden").notNull().default(0),
  kpiId: integer("kpi_id").references(() => kpis.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const productos = pgTable("productos", {
  id: serial("id").primaryKey(),
  codigoProducto: text("codigo_producto").notNull().unique(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  precio: numeric("precio", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const productoTiposNegocio = pgTable("producto_tipos_negocio", {
  id: serial("id").primaryKey(),
  productoId: integer("producto_id").notNull().references(() => productos.id, { onDelete: "cascade" }),
  tipoNegocioId: integer("tipo_negocio_id").notNull().references(() => tiposNegocio.id, { onDelete: "cascade" }),
});

export const kpis = pgTable("kpis", {
  id: serial("id").primaryKey(),
  codigoKpi: text("codigo_kpi").notNull().unique(),
  kpi: text("kpi").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  valor: text("valor").notNull().default(""),
  periodoEvaluacion: text("periodo_evaluacion").notNull().default("Mensual"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const oportunidades = pgTable("oportunidades", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  clienteId: integer("cliente_id").references(() => clientes.id),
  tipoNegocioId: integer("tipo_negocio_id").references(() => tiposNegocio.id),
  productoId: integer("producto_id").references(() => productos.id),
  etapaVentaId: integer("etapa_venta_id").notNull().references(() => etapasVenta.id),
  valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }).notNull().default("0"),
  probabilidad: integer("probabilidad").notNull().default(0),
  responsableId: integer("responsable_id").references(() => users.id),
  estado: text("estado").notNull().default("activa"),
  motivoCierre: text("motivo_cierre"),
  fechaCierre: timestamp("fecha_cierre"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const historialEtapas = pgTable("historial_etapas", {
  id: serial("id").primaryKey(),
  oportunidadId: integer("oportunidad_id").notNull().references(() => oportunidades.id, { onDelete: "cascade" }),
  etapaVentaId: integer("etapa_venta_id").notNull().references(() => etapasVenta.id),
  valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }).notNull().default("0"),
  probabilidad: integer("probabilidad").notNull().default(0),
  entradaAt: timestamp("entrada_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  salidaAt: timestamp("salida_at"),
});

export const cotizaciones = pgTable("cotizaciones", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull(),
  oportunidadId: integer("oportunidad_id").notNull().references(() => oportunidades.id, { onDelete: "cascade" }),
  descripcion: text("descripcion").notNull().default(""),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull().default("0"),
  estado: text("estado").notNull().default("borrador"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const actividades = pgTable("actividades", {
  id: serial("id").primaryKey(),
  oportunidadId: integer("oportunidad_id").notNull().references(() => oportunidades.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("nota"),
  descripcion: text("descripcion").notNull(),
  usuarioId: integer("usuario_id").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  active: true,
});

export const insertRoleSchema = createInsertSchema(roles).pick({
  name: true,
  description: true,
});

export const insertPermissionSchema = createInsertSchema(permissions).pick({
  key: true,
  description: true,
  module: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type TipoNegocio = typeof tiposNegocio.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;
export type EtapaVenta = typeof etapasVenta.$inferSelect;
export type Producto = typeof productos.$inferSelect;
export type Kpi = typeof kpis.$inferSelect;
export type Oportunidad = typeof oportunidades.$inferSelect;
export type HistorialEtapa = typeof historialEtapas.$inferSelect;
export type Cotizacion = typeof cotizaciones.$inferSelect;
export type Actividad = typeof actividades.$inferSelect;

export * from "./models/chat";

// ───────── Service Desk (sd_*) ─────────
const ts = (n: string) => timestamp(n).default(sql`CURRENT_TIMESTAMP`).notNull();

export const sdProducts = pgTable("sd_products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at"),
});

export const sdAccounts = pgTable("sd_accounts", {
  id: serial("id").primaryKey(),
  clienteId: integer("cliente_id").notNull().unique().references(() => clientes.id),
  accountType: text("account_type").notNull().default("suscripcion"),
  ticketPrefix: text("ticket_prefix").notNull().unique(),
  ticketSeq: integer("ticket_seq").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at"),
});

export const sdInstances = pgTable("sd_instances", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => sdProducts.id),
  name: text("name").notNull(),
  environment: text("environment").notNull().default("prod"),
  baseUrl: text("base_url").notNull().default(""),
  active: boolean("active").notNull().default(true),
});

export const sdContracts = pgTable("sd_contracts", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => sdProducts.id),
  plan: text("plan").notNull().default("estandar"),
  slaActiveFrom: timestamp("sla_active_from"),
  calendar: text("calendar").notNull().default("America/Mexico_City"),
  reportRecipients: jsonb("report_recipients").notNull().default([]),
  hoursBank: numeric("hours_bank"),
  extraHourRate: numeric("extra_hour_rate"),
  extraCurrency: text("extra_currency").notNull().default("MXN"),
  lifecycle: text("lifecycle").notNull().default("operation"), // discovery | implementation | parallel | operation
  lifecycleLog: jsonb("lifecycle_log").notNull().default([]), // [{lifecycle, from}] so SLA is decided by each ticket's creation time
  active: boolean("active").notNull().default(true),
});

export const sdContacts = pgTable("sd_contacts", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("contact"),
}, (t) => ({ uq: unique("sd_contacts_account_email").on(t.accountId, t.email) }));

export const sdRoleAssignments = pgTable("sd_role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  scopeType: text("scope_type").notNull().default("global"),
  scopeId: integer("scope_id"),
});

export const sdSettings = pgTable("sd_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at"),
  updatedBy: integer("updated_by"),
});

export const sdEmailLog = pgTable("sd_email_log", {
  id: serial("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: ts("created_at"),
});

export const sdAuditLog = pgTable("sd_audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at"),
  actorUserId: integer("actor_user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: jsonb("detail").notNull().default({}),
});

export const sdTickets = pgTable("sd_tickets", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id),
  seq: integer("seq").notNull(),
  key: text("key").notNull().unique(),
  type: text("type").notNull(),
  productId: integer("product_id").references(() => sdProducts.id),
  instanceId: integer("instance_id").references(() => sdInstances.id),
  requesterContactId: integer("requester_contact_id").references(() => sdContacts.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  severity: text("severity"),
  perceivedSeverity: text("perceived_severity"),
  priorityInternal: integer("priority_internal").notNull().default(3),
  status: text("status").notNull(),
  assigneeUserId: integer("assignee_user_id").references(() => users.id),
  channel: text("channel").notNull().default("manual"),
  environment: text("environment").notNull().default("prod"),
  moduleArea: text("module_area").notNull().default(""),
  sharedWithAccount: boolean("shared_with_account").notNull().default(false),
  slaApplicable: boolean("sla_applicable").notNull().default(true),
  slaExclusionReason: text("sla_exclusion_reason"),
  slaExcludedBy: integer("sla_excluded_by"),
  importRef: text("import_ref"),
  importFlags: jsonb("import_flags"),
  context: jsonb("context"),
  rca: jsonb("rca"),
  receivedAt: ts("received_at"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  firstResponseAt: timestamp("first_response_at"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
}, (t) => ({ uq: unique("sd_tickets_account_seq").on(t.accountId, t.seq) }));

export const sdTicketEvents = pgTable("sd_ticket_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => sdTickets.id, { onDelete: "cascade" }),
  at: timestamp("at", { precision: 3 }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  actorType: text("actor_type").notNull(),
  actorId: integer("actor_id"),
  kind: text("kind").notNull(),
  detail: jsonb("detail").notNull().default({}),
});

export const sdTicketComments = pgTable("sd_ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => sdTickets.id, { onDelete: "cascade" }),
  visibility: text("visibility").notNull().default("public"),
  authorType: text("author_type").notNull(),
  authorId: integer("author_id"),
  body: text("body").notNull(),
  createdAt: ts("created_at"),
});

export const sdTimeEntries = pgTable("sd_time_entries", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => sdTickets.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  minutes: integer("minutes").notNull(),
  billable: boolean("billable").notNull().default(true),
  workDate: text("work_date").notNull(),
  note: text("note").notNull().default(""),
  createdAt: ts("created_at"),
});

export const sdPortalTokens = pgTable("sd_portal_tokens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: ts("created_at"),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const sdTicketAttachments = pgTable("sd_ticket_attachments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => sdTickets.id, { onDelete: "cascade" }),
  visibility: text("visibility").notNull().default("public"),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  uploaderType: text("uploader_type").notNull(),
  uploaderId: integer("uploader_id"),
  createdAt: ts("created_at"),
});

export const sdSlaPolicies = pgTable("sd_sla_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(100),
  filters: jsonb("filters").notNull().default({}),
  calendarKind: text("calendar_kind").notNull().default("business"),
  firstResponseMin: integer("first_response_min"),
  updateMin: integer("update_min"),
  resolutionMin: integer("resolution_min"),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  updatedAt: ts("updated_at"),
});
export const sdHolidays = pgTable("sd_holidays", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => sdAccounts.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  name: text("name").notNull().default(""),
});
export const sdSlaInstances = pgTable("sd_sla_instances", {
  ticketId: integer("ticket_id").notNull().references(() => sdTickets.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  policyId: integer("policy_id"),
  policyVersion: integer("policy_version"),
  state: text("state").notNull(),
  targetMs: numeric("target_ms").notNull(),
  elapsedMs: numeric("elapsed_ms").notNull(),
  dueAt: timestamp("due_at"),
  paused: boolean("paused").notNull().default(false),
  stoppedAt: timestamp("stopped_at"),
  breaches: integer("breaches").notNull().default(0),
  pauses: jsonb("pauses").notNull().default([]),
  calcVersion: integer("calc_version").notNull().default(1),
  computedAt: ts("computed_at"),
}, (t) => ({ uq: unique("sd_sla_instances_pk").on(t.ticketId, t.metric) }));
export const sdSlaAlerts = pgTable("sd_sla_alerts", {
  ticketId: integer("ticket_id").notNull().references(() => sdTickets.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  threshold: integer("threshold").notNull(),
  sentAt: ts("sent_at"),
}, (t) => ({ uq: unique("sd_sla_alerts_pk").on(t.ticketId, t.metric, t.threshold) }));
export const sdSlaChanges = pgTable("sd_sla_changes", {
  id: serial("id").primaryKey(),
  at: ts("at"),
  userId: integer("user_id"),
  kind: text("kind").notNull(),
  detail: jsonb("detail").notNull().default({}),
});

export const sdSdkKeys = pgTable("sd_sdk_keys", {
  id: serial("id").primaryKey(),
  keyId: text("key_id").notNull().unique(),
  productId: integer("product_id").notNull().references(() => sdProducts.id),
  name: text("name").notNull(),
  secretEnc: text("secret_enc").notNull(),
  allowedOrigins: jsonb("allowed_origins").notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at"),
  lastUsedAt: timestamp("last_used_at"),
});

export const sdMonitors = pgTable("sd_monitors", {
  id: serial("id").primaryKey(),
  instanceId: integer("instance_id").notNull().references(() => sdInstances.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  expectedStatus: integer("expected_status").notNull().default(200),
  isPublic: boolean("is_public").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at"),
});
export const sdProbeResults = pgTable("sd_probe_results", {
  monitorId: integer("monitor_id").notNull().references(() => sdMonitors.id, { onDelete: "cascade" }),
  minute: timestamp("minute").notNull(),
  location: text("location").notNull(),
  ok: boolean("ok").notNull(),
  status: integer("status"),
  latencyMs: integer("latency_ms"),
}, (t) => ({ uq: unique("sd_probe_results_pk").on(t.monitorId, t.minute, t.location) }));
export const sdPlatformIncidents = pgTable("sd_platform_incidents", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => sdProducts.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("investigating"),
  impact: text("impact").notNull().default("minor"),
  isPublic: boolean("is_public").notNull().default(true),
  auto: boolean("auto").notNull().default(false),
  startedAt: ts("started_at"),
  resolvedAt: timestamp("resolved_at"),
  rca: jsonb("rca"),
  createdBy: integer("created_by"),
});
export const sdPlatformIncidentUpdates = pgTable("sd_platform_incident_updates", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => sdPlatformIncidents.id, { onDelete: "cascade" }),
  at: ts("at"),
  status: text("status").notNull(),
  body: text("body").notNull(),
});
export const sdMaintenance = pgTable("sd_maintenance", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => sdProducts.id),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  noticeOk: boolean("notice_ok").notNull().default(false),
  createdAt: ts("created_at"),
  createdBy: integer("created_by"),
});

export const sdReports = pgTable("sd_reports", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id, { onDelete: "cascade" }),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  data: jsonb("data").notNull(),
  note: text("note").notNull().default(""),
  createdAt: ts("created_at"),
  createdBy: integer("created_by"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  sendLog: jsonb("send_log").notNull().default([]),
}, (t) => ({ uq: unique("sd_reports_period_version").on(t.accountId, t.periodYear, t.periodMonth, t.version) }));

export const sdFeatures = pgTable("sd_features", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => sdProducts.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("evaluating"),
  outOfContract: boolean("out_of_contract").notNull().default(false),
  targetDate: text("target_date"),
  uatStartedAt: timestamp("uat_started_at"),
  releasedAt: timestamp("released_at"),
  releaseKind: text("release_kind"),
  createdBy: integer("created_by"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});
export const sdFeatureRequests = pgTable("sd_feature_requests", {
  id: serial("id").primaryKey(),
  featureId: integer("feature_id").notNull().references(() => sdFeatures.id, { onDelete: "cascade" }),
  ticketId: integer("ticket_id").notNull().unique().references(() => sdTickets.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id),
  weight: integer("weight").notNull().default(1),
  createdAt: ts("created_at"),
});
export const sdFeatureQuotes = pgTable("sd_feature_quotes", {
  id: serial("id").primaryKey(),
  featureId: integer("feature_id").notNull().references(() => sdFeatures.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  scope: text("scope").notNull(),
  hours: numeric("hours").notNull(),
  cost: numeric("cost").notNull(),
  currency: text("currency").notNull().default("MXN"),
  assumptions: text("assumptions").notNull().default(""),
  validUntil: text("valid_until").notNull(),
  outOfContract: boolean("out_of_contract").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: ts("created_at"),
  sentAt: timestamp("sent_at"),
  decidedContactId: integer("decided_contact_id"),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note").notNull().default(""),
});
export const sdFeatureDates = pgTable("sd_feature_dates", {
  id: serial("id").primaryKey(),
  featureId: integer("feature_id").notNull().references(() => sdFeatures.id, { onDelete: "cascade" }),
  targetDate: text("target_date"),
  reason: text("reason").notNull().default(""),
  changedBy: integer("changed_by"),
  at: ts("at"),
});
export const sdUatItems = pgTable("sd_uat_items", {
  id: serial("id").primaryKey(),
  featureId: integer("feature_id").notNull().references(() => sdFeatures.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id),
  position: integer("position").notNull().default(0),
  what: text("what").notNull(),
  how: text("how").notNull().default(""),
  status: text("status").notNull().default("pending"),
  comment: text("comment").notNull().default(""),
  decidedContactId: integer("decided_contact_id"),
  decidedAt: timestamp("decided_at"),
  tacit: boolean("tacit").notNull().default(false),
  childTicketId: integer("child_ticket_id").references(() => sdTickets.id, { onDelete: "set null" }),
});
export const sdBankAlerts = pgTable("sd_bank_alerts", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => sdContracts.id, { onDelete: "cascade" }),
  threshold: integer("threshold").notNull(),
  sentAt: ts("sent_at"),
});

export const sdProjects = pgTable("sd_projects", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => sdAccounts.id),
  name: text("name").notNull(),
  solutionType: text("solution_type").notNull().default(""),
  status: text("status").notNull().default("planning"),
  startDate: text("start_date").notNull(),
  baselineVersion: integer("baseline_version").notNull().default(0),
  baselineApprovedAt: timestamp("baseline_approved_at"),
  handoffAt: timestamp("handoff_at"),
  pausesSla: boolean("pauses_sla").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: ts("created_at"),
});
export const sdProjectPhases = pgTable("sd_project_phases", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});
export const sdProjectTasks = pgTable("sd_project_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  phaseId: integer("phase_id").references(() => sdProjectPhases.id, { onDelete: "set null" }),
  code: text("code").notNull().default(""),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("task"),
  assigneeUserId: integer("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
  assigneeContactId: integer("assignee_contact_id").references(() => sdContacts.id, { onDelete: "set null" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: integer("days").notNull().default(1),
  hours: numeric("hours"),
  pct: integer("pct").notNull().default(0),
  progressNote: text("progress_note").notNull().default(""),
  fixedStart: text("fixed_start"),
  deps: jsonb("deps").notNull().default([]),
  notes: text("notes").notNull().default(""),
  clientVisible: boolean("client_visible").notNull().default(true),
  blockedByClient: boolean("blocked_by_client").notNull().default(false),
  clientSide: boolean("client_side").notNull().default(false),
  docIds: jsonb("doc_ids").notNull().default([]),
  position: integer("position").notNull().default(0),
  updatedAt: ts("updated_at"),
});
export const sdProjectBaselines = pgTable("sd_project_baselines", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  reason: text("reason").notNull().default(""),
  origin: text("origin").notNull().default("qss"),
  approvedBy: integer("approved_by"),
  approvedAt: ts("approved_at"),
  snapshot: jsonb("snapshot").notNull(),
});
export const sdProjectGates = pgTable("sd_project_gates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  phaseId: integer("phase_id").references(() => sdProjectPhases.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  criteria: jsonb("criteria").notNull().default([]),
  evidence: jsonb("evidence").notNull().default([]),
  status: text("status").notNull().default("open"),
  result: text("result"),
  signedAt: timestamp("signed_at"),
  clientVisible: boolean("client_visible").notNull().default(true),
  kind: text("kind").notNull().default("normal"), // normal | handoff | close
  dateLocked: boolean("date_locked").notNull().default(false), // imported gates keep the file date instead of following their phase end
});
export const sdGateSignoffs = pgTable("sd_gate_signoffs", {
  id: serial("id").primaryKey(),
  gateId: integer("gate_id").notNull().references(() => sdProjectGates.id, { onDelete: "cascade" }),
  signerType: text("signer_type").notNull(),
  signerId: integer("signer_id").notNull(),
  result: text("result").notNull(),
  note: text("note").notNull().default(""),
  ip: text("ip").notNull().default(""),
  fingerprint: text("fingerprint").notNull(),
  at: ts("at"),
});

export const sdProjectDocs = pgTable("sd_project_docs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  priority: text("priority").notNull().default("A"),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("pendiente"),
  ownerContactId: integer("owner_contact_id").references(() => sdContacts.id, { onDelete: "set null" }),
  files: jsonb("files").notNull().default([]),
  comments: jsonb("comments").notNull().default([]),
  clientVisible: boolean("client_visible").notNull().default(true),
  lastReminder: text("last_reminder"),
  lastReminderAt: timestamp("last_reminder_at"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
}, (t) => ({ uq: unique("sd_project_docs_code").on(t.projectId, t.code) }));
export const sdProjectDecisions = pgTable("sd_project_decisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  question: text("question").notNull(),
  options: jsonb("options").notNull().default([]),
  defaultDecision: text("default_decision").notNull().default(""),
  deadline: text("deadline").notNull(),
  decider: text("decider").notNull().default(""),
  status: text("status").notNull().default("open"), // open | decided | defaulted
  decision: text("decision"),
  decidedAt: timestamp("decided_at"),
  decidedByContactId: integer("decided_by_contact_id"),
  impact: text("impact").notNull().default(""),
  clientVisible: boolean("client_visible").notNull().default(true),
  notifiedAt: timestamp("notified_at"),
  createdAt: ts("created_at"),
}, (t) => ({ uq: unique("sd_project_decisions_code").on(t.projectId, t.code) }));
export const sdProjectRisks = pgTable("sd_project_risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  title: text("title").notNull(),
  probability: integer("probability").notNull().default(2),
  impact: integer("impact").notNull().default(2),
  ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  mitigation: text("mitigation").notNull().default(""),
  triggerText: text("trigger_text").notNull().default(""),
  status: text("status").notNull().default("open"), // open | mitigated | occurred | closed
  taskIds: jsonb("task_ids").notNull().default([]),
  shared: boolean("shared").notNull().default(false),
  createdAt: ts("created_at"),
}, (t) => ({ uq: unique("sd_project_risks_code").on(t.projectId, t.code) }));
export const sdProjectModules = pgTable("sd_project_modules", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("planned"), // planned | in_dev | uat | released
  clientVisible: boolean("client_visible").notNull().default(true),
  releasedAt: timestamp("released_at"),
}, (t) => ({ uq: unique("sd_project_modules_code").on(t.projectId, t.code) }));
export const sdProjectPayments = pgTable("sd_project_payments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: numeric("amount").notNull().default("0"),
  currency: text("currency").notNull().default("MXN"),
  dueDate: text("due_date").notNull(),
  gateId: integer("gate_id").references(() => sdProjectGates.id, { onDelete: "set null" }),
  deliverable: text("deliverable").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | invoiced | paid (mirrored from QFactura Hub)
  clientVisible: boolean("client_visible").notNull().default(false),
});
export const sdProjectAudit = pgTable("sd_project_audit", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  action: text("action").notNull(),
  detail: jsonb("detail").notNull().default({}),
  at: ts("at"),
});

export const sdProjectChanges = pgTable("sd_project_changes", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  ticketId: integer("ticket_id").references(() => sdTickets.id, { onDelete: "set null" }),
  hoursImpact: numeric("hours_impact").notNull().default("0"),
  costImpact: numeric("cost_impact").notNull().default("0"),
  currency: text("currency").notNull().default("MXN"),
  daysImpact: integer("days_impact").notNull().default(0),
  taskSpec: jsonb("task_spec"),
  status: text("status").notNull().default("draft"), // draft | proposed | approved | rejected | applied
  proposedAt: timestamp("proposed_at"),
  decidedByContactId: integer("decided_by_contact_id"),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note").notNull().default(""),
  appliedAt: timestamp("applied_at"),
  appliedBaselineVersion: integer("applied_baseline_version"),
  createdBy: integer("created_by"),
  createdAt: ts("created_at"),
}, (t) => ({ uq: unique("sd_project_changes_code").on(t.projectId, t.code) }));
export const sdProjectCuts = pgTable("sd_project_cuts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => sdProjects.id, { onDelete: "cascade" }),
  cutDate: text("cut_date").notNull(),
  status: text("status").notNull().default("draft"), // draft | approved | sent
  data: jsonb("data").notNull(),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  sendLog: jsonb("send_log").notNull().default([]),
  createdAt: ts("created_at"),
}, (t) => ({ uq: unique("sd_project_cuts_date").on(t.projectId, t.cutDate) }));
