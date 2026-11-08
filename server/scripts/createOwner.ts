import crypto from "crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { users, roles, userRoles, sdRoleAssignments } from "@shared/schema";
import { hashPassword } from "../auth";
import { ensureServiceDeskSchema } from "../serviceDesk/migrate";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const username = arg("username");
  const email = arg("email") ?? "";
  if (!username) throw new Error("Uso: --username <u> [--email <e>] [--disable-default-admin]");
  await ensureServiceDeskSchema();

  const password = crypto.randomBytes(15).toString("base64url"); // 20 chars
  let [user] = await db.select().from(users).where(eq(users.username, username));
  let created = false;
  if (!user) {
    [user] = await db.insert(users).values({ username, password: hashPassword(password), fullName: username, email, active: true }).returning();
    created = true;
  }

  let [adminRole] = await db.select().from(roles).where(eq(roles.name, "Administrador"));
  if (!adminRole) [adminRole] = await db.insert(roles).values({ name: "Administrador", description: "Acceso total al sistema" }).returning();
  const hasRole = await db.select().from(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, adminRole.id)));
  if (!hasRole.length) await db.insert(userRoles).values({ userId: user.id, roleId: adminRole.id });

  const hasOwner = await db.select().from(sdRoleAssignments).where(and(eq(sdRoleAssignments.userId, user.id), eq(sdRoleAssignments.role, "owner")));
  if (!hasOwner.length) await db.insert(sdRoleAssignments).values({ userId: user.id, role: "owner", scopeType: "global" });

  if (created) console.log(`Usuario creado: ${username}\nContraseña (se muestra una sola vez): ${password}`);
  else console.log(`Usuario ${username} ya existía; contraseña sin cambios.`);

  if (process.argv.includes("--disable-default-admin")) {
    const [other] = await db.select({ id: users.id }).from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.roleId, adminRole.id), eq(users.active, true), ne(users.username, "admin"))).limit(1);
    if (!other) throw new Error("No hay otro administrador activo; no se desactiva 'admin'.");
    await db.update(users).set({ active: false }).where(eq(users.username, "admin"));
    console.log("Usuario 'admin' desactivado.");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
