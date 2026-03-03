import { db } from "./db";
import { users, userRoles, roles, rolePermissions, permissions } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === testHash;
}

export async function getUserPermissions(userId: number): Promise<string[]> {
  const result = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userId));

  return [...new Set(result.map((r) => r.key))];
}

export async function getUserRoles(userId: number): Promise<string[]> {
  const result = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  return result.map((r) => r.name);
}

export async function seedAdminUser() {
  const existing = await db.select().from(users).where(eq(users.username, "admin"));
  if (existing.length > 0) return;

  const hashedPw = hashPassword("admin123");

  const [adminRole] = await db
    .insert(roles)
    .values({ name: "Administrador", description: "Acceso total al sistema" })
    .onConflictDoNothing()
    .returning();

  const permKeys = [
    { key: "users.view", description: "Ver usuarios", module: "usuarios" },
    { key: "users.create", description: "Crear usuarios", module: "usuarios" },
    { key: "users.edit", description: "Editar usuarios", module: "usuarios" },
    { key: "users.delete", description: "Eliminar usuarios", module: "usuarios" },
    { key: "roles.view", description: "Ver roles", module: "roles" },
    { key: "roles.create", description: "Crear roles", module: "roles" },
    { key: "roles.edit", description: "Editar roles", module: "roles" },
    { key: "roles.delete", description: "Eliminar roles", module: "roles" },
  ];

  const insertedPerms = await db
    .insert(permissions)
    .values(permKeys)
    .onConflictDoNothing()
    .returning();

  if (adminRole && insertedPerms.length > 0) {
    await db.insert(rolePermissions).values(
      insertedPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id }))
    ).onConflictDoNothing();
  }

  const [adminUser] = await db
    .insert(users)
    .values({
      username: "admin",
      password: hashedPw,
      fullName: "Administrador",
      email: "contacto@qsoftwaresolutions.com",
      active: true,
    })
    .returning();

  if (adminRole && adminUser) {
    await db.insert(userRoles).values({ userId: adminUser.id, roleId: adminRole.id });
  }

  console.log("Admin user seeded: admin / admin123");
}
