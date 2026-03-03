import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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

export * from "./models/chat";
