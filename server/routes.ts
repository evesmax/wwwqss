import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { db } from "./db";
import { users, roles, permissions, rolePermissions, userRoles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword, verifyPassword, getUserPermissions, getUserRoles, seedAdminUser } from "./auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerCatalogRoutes } from "./catalogRoutes";
import { registerPipelineRoutes } from "./pipelineRoutes";

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
  registerCatalogRoutes(app, requireAuth);
  registerPipelineRoutes(app, requireAuth);

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

2. **QNexus App** - Aplicación móvil para monitoreo operativo. Extensión móvil de QNexus. Notificaciones push, modo offline, seguridad biométrica. IDEAL PARA: gerentes de flotilla y operadores en campo.

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
- Para QNexus (logística): Enfocarse en ROI por ahorro de combustible y optimización. Buscar empresas con +10 vehículos.
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
