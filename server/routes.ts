import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { db } from "./db";
import { users, roles, permissions, rolePermissions, userRoles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword, getUserPermissions, getUserRoles, seedAdminUser } from "./auth";
import { registerChatRoutes } from "./replit_integrations/chat";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "No autorizado" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "qss-admin-secret-key-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  await seedAdminUser();

  registerChatRoutes(app);

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Usuario y contraseña requeridos" });
      }

      const [user] = await db.select().from(users).where(eq(users.username, username));
      if (!user || !verifyPassword(password, user.password)) {
        return res.status(401).json({ message: "Credenciales incorrectas" });
      }
      if (!user.active) {
        return res.status(403).json({ message: "Usuario desactivado" });
      }

      req.session.userId = user.id;
      const userPerms = await getUserPermissions(user.id);
      const userRoleNames = await getUserRoles(user.id);

      res.json({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        roles: userRoleNames,
        permissions: userPerms,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ message: "Sesión cerrada" });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "No autorizado" });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      if (!user) return res.status(401).json({ message: "Usuario no encontrado" });

      const userPerms = await getUserPermissions(user.id);
      const userRoleNames = await getUserRoles(user.id);

      res.json({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        roles: userRoleNames,
        permissions: userPerms,
      });
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/auth/password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
      if (!user || !verifyPassword(currentPassword, user.password)) {
        return res.status(400).json({ message: "Contraseña actual incorrecta" });
      }
      await db.update(users).set({ password: hashPassword(newPassword) }).where(eq(users.id, user.id));
      res.json({ message: "Contraseña actualizada" });
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/admin/users", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        active: users.active,
        createdAt: users.createdAt,
      }).from(users);

      const usersWithRoles = await Promise.all(
        allUsers.map(async (u) => {
          const uRoles = await db
            .select({ roleId: userRoles.roleId, roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(eq(userRoles.userId, u.id));
          return { ...u, roles: uRoles };
        })
      );

      res.json(usersWithRoles);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/admin/users", requireAuth, async (req: Request, res: Response) => {
    try {
      const { username, password, fullName, email, active, roleIds } = req.body;
      const hashedPw = hashPassword(password);

      const [newUser] = await db
        .insert(users)
        .values({ username, password: hashedPw, fullName, email, active: active ?? true })
        .returning();

      if (roleIds && roleIds.length > 0) {
        await db.insert(userRoles).values(
          roleIds.map((roleId: number) => ({ userId: newUser.id, roleId }))
        );
      }

      res.status(201).json(newUser);
    } catch (error: any) {
      if (error?.constraint?.includes("unique")) {
        return res.status(400).json({ message: "El nombre de usuario ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/admin/users/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { username, fullName, email, active, password, roleIds } = req.body;

      const updateData: any = { username, fullName, email, active };
      if (password) {
        updateData.password = hashPassword(password);
      }

      const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });

      if (roleIds !== undefined) {
        await db.delete(userRoles).where(eq(userRoles.userId, id));
        if (roleIds.length > 0) {
          await db.insert(userRoles).values(
            roleIds.map((roleId: number) => ({ userId: id, roleId }))
          );
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (id === req.session.userId) {
        return res.status(400).json({ message: "No puedes eliminar tu propio usuario" });
      }
      await db.delete(userRoles).where(eq(userRoles.userId, id));
      await db.delete(users).where(eq(users.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/admin/roles", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allRoles = await db.select().from(roles);
      const rolesWithPerms = await Promise.all(
        allRoles.map(async (r) => {
          const rPerms = await db
            .select({ permissionId: rolePermissions.permissionId, permissionKey: permissions.key, permissionDesc: permissions.description })
            .from(rolePermissions)
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(eq(rolePermissions.roleId, r.id));
          return { ...r, permissions: rPerms };
        })
      );
      res.json(rolesWithPerms);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/admin/roles", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, description, permissionIds } = req.body;
      const [newRole] = await db.insert(roles).values({ name, description }).returning();

      if (permissionIds && permissionIds.length > 0) {
        await db.insert(rolePermissions).values(
          permissionIds.map((permissionId: number) => ({ roleId: newRole.id, permissionId }))
        );
      }

      res.status(201).json(newRole);
    } catch (error: any) {
      if (error?.constraint?.includes("unique")) {
        return res.status(400).json({ message: "El nombre del rol ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/admin/roles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, permissionIds } = req.body;

      const [updated] = await db.update(roles).set({ name, description }).where(eq(roles.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Rol no encontrado" });

      if (permissionIds !== undefined) {
        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        if (permissionIds.length > 0) {
          await db.insert(rolePermissions).values(
            permissionIds.map((permissionId: number) => ({ roleId: id, permissionId }))
          );
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/admin/roles/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await db.delete(userRoles).where(eq(userRoles.roleId, id));
      await db.delete(roles).where(eq(roles.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/admin/permissions", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allPerms = await db.select().from(permissions);
      res.json(allPerms);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/admin/permissions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { key, description, module } = req.body;
      const [newPerm] = await db.insert(permissions).values({ key, description, module }).returning();
      res.status(201).json(newPerm);
    } catch (error: any) {
      if (error?.constraint?.includes("unique")) {
        return res.status(400).json({ message: "La clave de permiso ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/admin/chat", requireAuth, async (req: Request, res: Response) => {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      });

      const { message, history } = req.body;

      const systemContext = `Eres el asistente de IA del panel de administración de QSoftware Solutions. 
Tu rol es ayudar a los administradores con el uso del sistema.

El sistema de administración tiene las siguientes secciones y funcionalidades:

1. **Roles y Permisos**: CRUD para gestionar roles del sistema. Cada rol puede tener múltiples permisos asignados. Los permisos disponibles son:
   - users.view, users.create, users.edit, users.delete (módulo Usuarios)
   - roles.view, roles.create, roles.edit, roles.delete (módulo Roles)
   
2. **Alta de Usuarios**: CRUD para gestionar usuarios. Cada usuario tiene: nombre de usuario, contraseña, nombre completo, email, estado (activo/inactivo), y roles asignados.

3. **Cambio de Contraseña**: Los usuarios pueden cambiar su propia contraseña desde el perfil en la barra lateral.

Responde siempre en español. Sé conciso y útil. Si te preguntan algo fuera del contexto del panel de administración, puedes responder pero menciona que tu especialidad es ayudar con el sistema.`;

      const contents = [
        { role: "user" as const, parts: [{ text: systemContext }] },
        { role: "model" as const, parts: [{ text: "Entendido. Soy el asistente del panel de administración de QSoftware Solutions. Estoy listo para ayudarte." }] },
        ...(history || []).map((m: any) => ({
          role: m.role === "user" ? "user" as const : "model" as const,
          parts: [{ text: m.content }],
        })),
        { role: "user" as const, parts: [{ text: message }] },
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents,
        config: { maxOutputTokens: 8192 },
      });

      for await (const chunk of stream) {
        const text = chunk.text || "";
        if (text) {
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Error en el chat" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: "Error en el chat" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
