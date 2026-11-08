import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, bigserial, unique } from "drizzle-orm/pg-core";
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
