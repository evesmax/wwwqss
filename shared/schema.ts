import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
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
export type Cotizacion = typeof cotizaciones.$inferSelect;
export type Actividad = typeof actividades.$inferSelect;

export * from "./models/chat";
