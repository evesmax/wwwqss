import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import crypto from "crypto";
import { db, pool } from "./db";
import { loginThrottle, throttleKey } from "./loginThrottle";
import { generateTotpSecret, totpUri, verifyTotp } from "./serviceDesk/totp";
import { writeAudit } from "./serviceDesk/audit";
import QRCode from "qrcode";
import { users, roles, permissions, rolePermissions, userRoles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword, getUserPermissions, getUserRoles, seedAdminUser, publicUser } from "./auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerCatalogRoutes } from "./catalogRoutes";
import { registerPipelineRoutes } from "./pipelineRoutes";
import { registerSalesAgentRoutes } from "./salesAgentRoutes";
import { registerDeskRoutes } from "./serviceDesk/routes";

declare module "express-session" {
  interface SessionData {
    userId: number;
    pendingUserId?: number;
    pendingAt?: number;
    totpSetupSecret?: string;
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const uid = req.session.userId;
  if (!uid) {
    return res.status(401).json({ message: "No autorizado" });
  }
  try {
    const [u] = await db.select({ active: users.active }).from(users).where(eq(users.id, uid));
    if (!u || !u.active) {
      return req.session.destroy(() => res.status(401).json({ message: "No autorizado" }));
    }
    next();
  } catch (e) {
    next(e);
  }
}

const PENDING_MFA_MS = 5 * 60_000;

function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return crypto.randomBytes(32).toString("hex");
}

async function userPayload(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    totpEnabled: user.totpEnabled,
    deskEnabled: process.env.SD_ENABLED === "true",
    roles: await getUserRoles(user.id),
    permissions: await getUserPermissions(user.id),
  };
}

// express-session may flush the response body before the store write finishes,
// so a client that immediately sends its next request can miss the session.
// Always persist explicitly before responding when the session was just changed.
function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

async function loginSession(req: Request, userId: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      resolve();
    });
  });
  await saveSession(req);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(
    session({
      store: new (connectPgSimple(session))({ pool: pool as any, tableName: "session", createTableIfMissing: true }),
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  await seedAdminUser();

  registerChatRoutes(app);
  registerCatalogRoutes(app, requireAuth);
  registerPipelineRoutes(app, requireAuth);
  registerSalesAgentRoutes(app);
  if (process.env.SD_ENABLED === "true") registerDeskRoutes(app, requireAuth);

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password || typeof username !== "string" || typeof password !== "string") {
        return res.status(400).json({ message: "Usuario y contraseña requeridos" });
      }
      const key = throttleKey(req.ip, username);
      if (loginThrottle.isBlocked(key)) {
        return res.status(429).json({ message: "Demasiados intentos. Intenta de nuevo en 15 minutos." });
      }

      const [user] = await db.select().from(users).where(eq(users.username, username));
      if (!user || !verifyPassword(password, user.password)) {
        loginThrottle.recordFailure(key);
        await writeAudit({ actorUserId: user?.id ?? null, action: "login.failed", entity: "user", entityId: user ? String(user.id) : undefined, detail: { username, ip: req.ip } }).catch(() => {});
        return res.status(401).json({ message: "Credenciales incorrectas" });
      }
      if (!user.active) {
        return res.status(403).json({ message: "Usuario desactivado" });
      }

      if (user.totpEnabled) {
        await new Promise<void>((resolve, reject) =>
          req.session.regenerate((err) => {
            if (err) return reject(err);
            req.session.pendingUserId = user.id;
            req.session.pendingAt = Date.now();
            resolve();
          }),
        );
        await saveSession(req);
        return res.json({ mfaRequired: true });
      }

      loginThrottle.reset(key);
      await loginSession(req, user.id);
      await writeAudit({ actorUserId: user.id, action: "login.ok", entity: "user", entityId: String(user.id), detail: { ip: req.ip } }).catch(() => {});
      res.json(await userPayload(user));
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/auth/mfa", async (req: Request, res: Response) => {
    try {
      const pendingId = req.session.pendingUserId;
      const token = String(req.body?.token ?? "");
      if (!pendingId || !req.session.pendingAt || Date.now() - req.session.pendingAt > PENDING_MFA_MS) {
        return res.status(401).json({ message: "Sesión de verificación expirada. Inicia sesión de nuevo." });
      }
      const [user] = await db.select().from(users).where(eq(users.id, pendingId));
      if (!user || !user.active || !user.totpEnabled || !user.totpSecret) {
        return res.status(401).json({ message: "No autorizado" });
      }
      const key = throttleKey(req.ip, user.username);
      if (loginThrottle.isBlocked(key)) {
        return res.status(429).json({ message: "Demasiados intentos. Intenta de nuevo en 15 minutos." });
      }
      if (!verifyTotp(user.totpSecret, token)) {
        loginThrottle.recordFailure(key);
        await writeAudit({ actorUserId: user.id, action: "mfa.failed", entity: "user", entityId: String(user.id), detail: { ip: req.ip } }).catch(() => {});
        return res.status(401).json({ message: "Código incorrecto" });
      }
      loginThrottle.reset(key);
      await loginSession(req, user.id);
      await writeAudit({ actorUserId: user.id, action: "login.ok", entity: "user", entityId: String(user.id), detail: { ip: req.ip, mfa: true } }).catch(() => {});
      res.json(await userPayload(user));
    } catch (error) {
      console.error("MFA error:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/auth/mfa/setup", requireAuth, async (req: Request, res: Response) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
      if (user.totpEnabled) return res.status(400).json({ message: "MFA ya está activado" });
      const secret = generateTotpSecret();
      req.session.totpSetupSecret = secret;
      await saveSession(req);
      const uri = totpUri(secret, user.email || user.username);
      res.json({ secret, otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri) });
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/auth/mfa/enable", requireAuth, async (req: Request, res: Response) => {
    try {
      const secret = req.session.totpSetupSecret;
      if (!secret) return res.status(400).json({ message: "Inicia la configuración de MFA primero" });
      if (!verifyTotp(secret, String(req.body?.token ?? ""))) {
        return res.status(400).json({ message: "Código incorrecto" });
      }
      await db.update(users).set({ totpSecret: secret, totpEnabled: true }).where(eq(users.id, req.session.userId!));
      delete req.session.totpSetupSecret;
      await writeAudit({ actorUserId: req.session.userId!, action: "mfa.enabled", entity: "user", entityId: String(req.session.userId) });
      res.json({ totpEnabled: true });
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/auth/mfa/disable", requireAuth, async (req: Request, res: Response) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
      if (!user.totpEnabled || !user.totpSecret || !verifyTotp(user.totpSecret, String(req.body?.token ?? ""))) {
        return res.status(400).json({ message: "Código incorrecto" });
      }
      await db.update(users).set({ totpSecret: null, totpEnabled: false }).where(eq(users.id, user.id));
      await writeAudit({ actorUserId: user.id, action: "mfa.disabled", entity: "user", entityId: String(user.id) });
      res.json({ totpEnabled: false });
    } catch (error) {
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

      if (!user.active) return res.status(401).json({ message: "No autorizado" });
      res.json(await userPayload(user));
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

      res.status(201).json(publicUser(newUser));
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

      res.json(publicUser(updated));
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
      const ai = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
        ? new GoogleGenAI({
            apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
            httpOptions: {
              apiVersion: "",
              baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
            },
          })
        : new GoogleGenAI({ apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY });

      const { message, history, searchMode } = req.body;

      const systemContext = `Eres el asistente de IA del panel de administración y CRM de QSoftware Solutions (QSS), una empresa de consultoría y desarrollo de software con sede en Guadalajara, México.

Tienes tres capacidades principales:
1. OPERACIÓN DEL SISTEMA: Guiar a los usuarios sobre cómo usar todas las funciones del panel
2. BÚSQUEDA DE LEADS: Cuando se te pida, buscar empresas en internet para generar prospectos
3. CONSULTORÍA DE VENTAS: Recomendar estrategias de venta de software basadas en el contexto de QSS

═══ CONOCIMIENTO DEL SISTEMA ═══

El panel de administración tiene las siguientes secciones:

📊 **Pipeline de Ventas** (ruta: /admin/pipeline)
- Vista Kanban con columnas por cada etapa de venta (drag & drop entre etapas)
- Vista Lista con tabla de todas las oportunidades
- Tarjetas KPI: Valor del Pipeline, Oportunidades Activas, Win Rate, En Riesgo
- Crear oportunidad: botón "+ Nueva Oportunidad" o "+ Añadir tarjeta" en cada columna
- Cada oportunidad tiene: código auto (OP-NNN), nombre, cliente, tipo de negocio, producto, etapa, valor estimado, probabilidad, responsable
- Al arrastrar a una etapa "Final", se abre modal para cerrar como Ganada o Perdida (con motivo)
- Modal de detalle: información completa, timeline de actividades (llamadas, correos, reuniones, notas) y cotizaciones (código auto COT-NNN)
- Las oportunidades con más de 7 días sin actividad se marcan como "ESTANCADA"

📈 **Seguimiento de KPIs** (ruta: /admin/kpi-tracking)
- Dashboard interactivo que muestra cumplimiento de metas
- Filtro multi-selección de KPIs
- Filtro de periodo: Mensual (por mes), Trimestral, Semestral, Anual
- Rango de fechas personalizado
- Cada KPI muestra: barra de progreso, valor ponderado vs meta, oportunidades activas
- Vista expandida: etapas vinculadas con oportunidades por etapa
- Análisis detallado: cruce KPI vs Oportunidades con contribución por etapa

📚 **Catálogos** (submenú expandible):
- **Tipos de Negocio** (/admin/catalogs/tipos-negocio): Categorías de negocio (código, nombre, descripción)
- **Clientes** (/admin/catalogs/clientes): Tipo Prospecto o Cliente, nombre del negocio, tipo de negocio, contacto, teléfono, metadatos clave-valor personalizables
- **Etapas de Venta** (/admin/catalogs/etapas-venta): Etapas del embudo con código, nombre, orden, probabilidad (0-100%), etapa inicial/final, KPI vinculado
- **Productos** (/admin/catalogs/productos): Productos de QSS con código, nombre, descripción, precio, tipos de negocio asociados (relación muchos a muchos)
- **KPIs** (/admin/catalogs/kpis): Indicadores con código, nombre, descripción, valor meta, periodo de evaluación (Mensual/Trimestral/Semestral/Anual)

🔒 **Roles y Permisos** (/admin/roles): CRUD de roles con permisos granulares (users.view/create/edit/delete, roles.view/create/edit/delete)

👤 **Alta de Usuarios** (/admin/users): CRUD de usuarios con nombre, contraseña, nombre completo, email, estado activo/inactivo, roles asignados

🔑 **Cambio de Contraseña**: Disponible desde el perfil en la barra lateral

💬 **Asistente Gemini** (este chat): Disponible como ventana flotante arrastrable desde el botón en la esquina inferior derecha

═══ PRODUCTOS DE QSS ═══

QSoftware Solutions ofrece los siguientes productos de software:

1. **QNexus Control** - Plataforma integral de gestión de flotas vehiculares y control logístico en tiempo real. GPS, optimización de rutas, control de inventario. IDEAL PARA: empresas de transporte, logística, flotillas vehiculares. Reduce costos de combustible hasta 30%.

2. **QNexusApp** - Sistema moderno de punto de venta y gestión retail adaptado a tu negocio. Plataforma bilingüe (inglés/español) con POS táctil Scan & Go, gestión de inventario en tiempo real multi-ubicación, administración multi-sucursal desde un solo panel, órdenes de compra automatizadas con controles antirrobo, y reportes avanzados con dashboards. IDEAL PARA: tiendas minoristas, cadenas de retail, tiendas de conveniencia, delis, negocios con múltiples sucursales. Sitio: qnexusapp.com

3. **QCampusOne** - Sistema completo de gestión académica y administrativa para instituciones educativas. Planes de estudio, inscripciones, calificaciones, portal padres/maestros. IDEAL PARA: escuelas, colegios, universidades.

4. **Q Food Control** - Plataforma de gestión para restaurantes. POS integrado, control de mesas/órdenes en tiempo real, inventario, análisis de menú. IDEAL PARA: restaurantes, cafeterías, sector gastronómico.

5. **Q Inventia Control** - Gestión de inventarios en la nube. Visibilidad de stock en tiempo real, cálculo de costos, alertas inteligentes de reorden. IDEAL PARA: almacenes, retail, empresas con inventario complejo.

6. **HolaKura** - Plataforma de atención al cliente con IA conversacional. Chatbots inteligentes, integración WhatsApp y web, atención 24/7, análisis de sentimiento, agenda clínica digital. IDEAL PARA: empresas con alto volumen de atención al cliente, clínicas.

7. **Auranuba** - Gestión inteligente de eventos e invitaciones digitales. Check-in QR, dashboard KPIs en tiempo real, integración de pagos. IDEAL PARA: organizadores de eventos corporativos y sociales.

8. **Q Professional Services** - Desarrollo de software a la medida, diseño UI/UX, consultoría tecnológica. IDEAL PARA: empresas con necesidades únicas no cubiertas por software estándar.

═══ GUÍA DE VENTAS DE SOFTWARE ═══

Cuando te pidan recomendaciones de venta, sigue esta metodología:

**Calificación de Prospectos (BANT):**
- Budget (Presupuesto): ¿Tienen capacidad de inversión?
- Authority (Autoridad): ¿Estás hablando con el decisor?
- Need (Necesidad): ¿Tienen un problema real que nuestro software resuelve?
- Timeline (Tiempo): ¿Cuándo necesitan la solución?

**Proceso de Venta Recomendado:**
1. Prospección (BDR) → Identificar empresas target
2. Primera Sesión y Calificación → Entender necesidades, calificar BANT
3. Presentación Demo General → Mostrar capacidades del producto
4. Demo Personalizada / Propuesta → Adaptar al caso específico
5. Negociación → Términos, precios, implementación
6. Cierre → Contrato y onboarding

**Estrategias por Tipo de Producto:**
- Para QNexus Control (logística): Enfocarse en ROI por ahorro de combustible y optimización. Buscar empresas con +10 vehículos.
- Para QNexusApp (retail/POS): Enfocarse en eficiencia operativa, control de inventario multi-sucursal y reducción de merma. Buscar tiendas minoristas, cadenas de retail, delis, tiendas de conveniencia con 2+ sucursales. Destacar interfaz bilingüe y sistema Scan & Go.
- Para QCampusOne (educación): Demostrar eficiencia administrativa. Buscar instituciones con +200 alumnos.
- Para Q Food Control (restaurantes): Enfocarse en control de inventario y reducción de merma. Cadenas de 3+ sucursales son ideales.
- Para Q Inventia (inventarios): ROI por reducción de pérdida y control de stock. Empresas con almacenes o retail.
- Para HolaKura (atención al cliente): Volumen de consultas y disponibilidad 24/7. Empresas con +100 consultas diarias.
- Para Auranuba (eventos): Organizadores recurrentes con +500 asistentes por evento.
- Para Software a la Medida: Empresas que ya tienen procesos complejos sin digitalizar.

**Objeciones Comunes y Respuestas:**
- "Es muy caro" → Calcular ROI: ahorro en tiempo, recursos, errores
- "Ya tenemos un sistema" → Comparar funcionalidades, ofrecer migración
- "No tenemos tiempo" → Implementación asistida, onboarding incluido
- "No estamos seguros" → Demo gratuita, periodo de prueba, casos de éxito

═══ BÚSQUEDA DE LEADS ═══

Cuando te pidan buscar empresas o leads:
- Usa tu capacidad de búsqueda en internet para encontrar empresas reales
- Presenta la información de forma estructurada: nombre, industria, ubicación, tamaño estimado, contacto si está disponible
- Sugiere qué producto de QSS sería más relevante para cada empresa encontrada
- Indica la estrategia de acercamiento recomendada

Responde SIEMPRE en español. Sé conciso pero completo. Usa formato con viñetas y negritas para facilitar la lectura. Cuando des instrucciones sobre el sistema, indica las rutas de navegación.`;

      const contents = [
        { role: "user" as const, parts: [{ text: systemContext }] },
        { role: "model" as const, parts: [{ text: "Entendido. Soy el asistente de IA de QSoftware Solutions. Puedo ayudarte con:\n\n1. **Operar el sistema** - Guiarte por todas las funciones del panel (Pipeline, KPIs, Catálogos, Usuarios, Roles)\n2. **Buscar leads** - Encontrar empresas en internet para generar prospectos\n3. **Estrategia de ventas** - Recomendar cómo vender nuestros productos de software\n\n¿En qué puedo ayudarte?" }] },
        ...(history || []).map((m: any) => ({
          role: m.role === "user" ? "user" as const : "model" as const,
          parts: [{ text: m.content }],
        })),
        { role: "user" as const, parts: [{ text: message }] },
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const needsSearch = searchMode || /busca|encuentra|investiga|leads|prospectos|empresas de|compañías de|negocios de|buscar empresas|buscar clientes|encuentra empresas|dame leads|dame prospectos|quiero encontrar/i.test(message);

      const config: any = {
        maxOutputTokens: 8192,
      };

      if (needsSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents,
        config,
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
